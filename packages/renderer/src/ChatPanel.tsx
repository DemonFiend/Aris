import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatChunk, StoredMessage, PositionContext, CompanionConfig, ScreenPositionState } from '@aris/shared';
import { buildPersonaSystemPrompt } from '@aris/shared';
import { VoiceControls } from './VoiceControls';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onAssistantMessage?: (text: string) => void;
  onStreamingChange?: (streaming: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function ChatPanel({ conversationId, onConversationCreated, onAssistantMessage, onStreamingChange, expanded, onToggleExpand }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamBufferRef = useRef('');
  const activeConvRef = useRef<string | null>(conversationId);
  const savedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Notify parent of streaming state changes
  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [streaming, onStreamingChange]);

  // Auto-expand history when streaming starts
  useEffect(() => {
    if (messages.length > 0 && streaming && !expanded) {
      onToggleExpand();
    }
  }, [messages.length, streaming, expanded, onToggleExpand]);

  // Load messages when conversation changes
  useEffect(() => {
    activeConvRef.current = conversationId;
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (streaming) return; // Don't overwrite in-progress streaming messages
    (async () => {
      const stored = (await window.aris.invoke('messages:list', conversationId)) as StoredMessage[] | undefined;
      if (activeConvRef.current === conversationId) {
        setMessages(
          (stored ?? [])
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        );
      }
    })();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps -- streaming intentionally excluded: we only reload on conversation change, not on every streaming state toggle

  useEffect(() => {
    const cleanup = window.aris.on('ai:stream-chunk', (chunk: unknown) => {
      const { text, done } = chunk as ChatChunk;
      if (text) {
        streamBufferRef.current += text;
        // Capture ref value now — if done arrives in the same React batch,
        // the ref will be cleared before this callback executes.
        const snapshot = streamBufferRef.current;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: snapshot };
          }
          return updated;
        });
      }
      if (done) {
        const finalContent = streamBufferRef.current;
        // Explicitly commit final content so it survives any React
        // batching edge-case where a prior text-chunk update was deferred.
        if (finalContent) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: finalContent };
            }
            return updated;
          });
        }
        streamBufferRef.current = '';
        setStreaming(false);
        const convId = activeConvRef.current;
        if (convId && finalContent) {
          savedRef.current = true;
          window.aris.invoke('messages:add', convId, 'assistant', finalContent);
          onAssistantMessage?.(finalContent);
        }
      }
    });
    return cleanup;
  }, []);

  // Save partial assistant response if component unmounts during streaming
  useEffect(() => {
    return () => {
      const buffer = streamBufferRef.current;
      const convId = activeConvRef.current;
      if (buffer && convId && !savedRef.current) {
        window.aris.invoke('messages:add', convId, 'assistant', buffer);
      }
    };
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setInput('');
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    if (!expanded) onToggleExpand();
    streamBufferRef.current = '';
    savedRef.current = false;

    let convId = activeConvRef.current;
    if (!convId) {
      const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
      const conv = (await window.aris.invoke('conversations:create', title)) as
        | { id: string }
        | undefined;
      if (!conv) {
        setStreaming(false);
        return;
      }
      convId = conv.id;
      activeConvRef.current = convId;
      onConversationCreated(convId);
    }

    await window.aris.invoke('messages:add', convId, 'user', text);

    try {
      const chatMessages = [...messages, userMsg].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // Build system prompt from persona config
      let systemPrompt: string;
      try {
        const config = (await window.aris.invoke('companion:get-config')) as CompanionConfig;
        systemPrompt = buildPersonaSystemPrompt(config.personality);
      } catch {
        systemPrompt =
          'You are Aris, a friendly and knowledgeable AI gaming companion. You help players with tips, strategies, lore, and conversation. Be concise and enthusiastic.';
      }
      try {
        const posCtx = (await window.aris.invoke('window:get-position-context')) as PositionContext | null;
        if (posCtx) {
          systemPrompt += `\n\n[Position context: You are displayed in a ${posCtx.windowBounds.width}x${posCtx.windowBounds.height} window, docked ${posCtx.dockPosition} on the ${posCtx.screenQuadrant} of the screen${posCtx.overlayMode ? ', in overlay mode on top of other windows' : ''}. You can naturally reference your position when relevant, e.g. "I can see I'm tucked in the corner" or "I'm floating over your game right now".]`;
        }
      } catch {
        // Position context unavailable — continue without it
      }
      try {
        const screenState = (await window.aris.invoke('screen:get-position-state')) as ScreenPositionState | null;
        if (screenState && screenState.mode !== 'disabled' && screenState.activeMonitorIndex !== null) {
          const monitor = screenState.monitors.find((m) => m.index === screenState.activeMonitorIndex);
          if (monitor) {
            const cellDescriptions: Record<number, string> = {
              1: 'top-left', 2: 'top-center', 3: 'top-right',
              4: 'middle-left', 5: 'center', 6: 'middle-right',
              7: 'bottom-left', 8: 'bottom-center', 9: 'bottom-right',
            };
            const cellDesc = cellDescriptions[screenState.activeGridCell ?? 5] ?? 'center';
            const monitorN = screenState.activeMonitorIndex + 1;
            const primaryLabel = monitor.isPrimary ? 'primary' : 'secondary';
            const totalMonitors = screenState.monitors.length;
            systemPrompt += `\n\n[Screen position: You are on Monitor ${monitorN} (${primaryLabel}), positioned in the ${cellDesc} area. ${totalMonitors} monitor${totalMonitors !== 1 ? 's' : ''} detected. Mention your screen position naturally when relevant.]`;
          }
        }
      } catch {
        // Screen position unavailable — continue without it
      }

      await window.aris.invoke('ai:stream-chat', chatMessages, {
        systemPrompt,
      });

      // Fallback: if the done signal was already handled by the stream listener,
      // streamBufferRef will be empty. Otherwise save the accumulated response.
      if (streamBufferRef.current) {
        const finalContent = streamBufferRef.current;
        const cid = activeConvRef.current;
        if (cid && finalContent) {
          window.aris.invoke('messages:add', cid, 'assistant', finalContent);
          onAssistantMessage?.(finalContent);
        }
        streamBufferRef.current = '';
        setStreaming(false);
      }
    } catch (err) {
      console.error('[ChatPanel] AI stream error:', err);
      const detail = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: `Failed to get a response: ${detail}`,
          };
        }
        return updated;
      });
      setStreaming(false);
      streamBufferRef.current = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleVoiceTranscript = useCallback((transcript: string) => {
    if (transcript && !streaming) {
      setInput(transcript);
    }
  }, [streaming]);

  return (
    <div style={containerStyle}>
      {/* ── Collapsible Message History Toggle ─── */}
      <button
        onClick={onToggleExpand}
        style={historyToggleStyle}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'var(--transition-normal)',
            }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
          Messages
          {messages.length > 0 && (
            <span style={badgeStyle}>{messages.length}</span>
          )}
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {/* ── Message History Area ─────────────── */}
      <div
        style={{
          ...historyPanelStyle,
          maxHeight: expanded ? '40vh' : '0',
        }}
      >
        <div style={messageListStyle}>
          {messages.length === 0 && (
            <div style={emptyStyle}>
              <p style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-1)', color: 'var(--text-primary)' }}>
                Hey! I'm Aris.
              </p>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 'var(--text-sm)' }}>
                Your AI gaming companion. Ask me anything.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={msg.role === 'user' ? userBubbleWrap : assistantBubbleWrap}>
              <div style={msg.role === 'user' ? userBubble : assistantBubble}>
                {msg.content || (streaming && i === messages.length - 1 ? '\u2026' : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input Bar ────────────────────────── */}
      <div style={inputBarStyle}>
        <VoiceControls onTranscript={handleVoiceTranscript} />
        <div style={{
          ...inputWrapperStyle,
          borderColor: inputFocused ? 'var(--border-strong)' : 'var(--border-default)',
          boxShadow: inputFocused ? 'var(--shadow-glow-sm)' : 'none',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={streaming ? 'Aris is thinking...' : 'Message Aris...'}
            disabled={streaming}
            rows={1}
            style={textareaStyle}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          style={{
            ...sendBtnStyle,
            opacity: streaming || !input.trim() ? 0.4 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────── */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
};

const historyToggleStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-2) var(--space-4)',
  background: 'var(--bg-surface)',
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
};

const badgeStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  color: 'var(--text-accent)',
  fontSize: '0.65rem',
  fontWeight: 'var(--font-bold)' as any,
  borderRadius: 'var(--radius-full)',
  padding: '1px 6px',
  lineHeight: 1.4,
};

const historyPanelStyle: React.CSSProperties = {
  overflow: 'hidden',
  transition: 'max-height 300ms ease',
  background: 'var(--bg-base)',
};

const messageListStyle: React.CSSProperties = {
  overflowY: 'auto',
  maxHeight: '40vh',
  padding: 'var(--space-3) var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4) 0',
  color: 'var(--text-secondary)',
};

const userBubbleWrap: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
};

const assistantBubbleWrap: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
};

const bubbleBase: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-xl)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-relaxed)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const userBubble: React.CSSProperties = {
  ...bubbleBase,
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  borderBottomRightRadius: 'var(--radius-sm)',
  maxWidth: '75%',
};

const assistantBubble: React.CSSProperties = {
  ...bubbleBase,
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)',
  borderBottomLeftRadius: 'var(--radius-sm)',
  maxWidth: '85%',
};

const inputBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--bg-base)',
  borderTop: '1px solid var(--border-subtle)',
};

const inputWrapperStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-2xl)',
  padding: '0 var(--space-3)',
  transition: 'border-color 200ms ease, box-shadow 200ms ease',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  background: 'transparent',
  color: 'var(--text-primary)',
  border: 'none',
  padding: 'var(--space-2) 0',
  fontSize: 'var(--text-base)',
  fontFamily: 'inherit',
  outline: 'none',
  lineHeight: 'var(--leading-normal)',
};

const sendBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
  flexShrink: 0,
  boxShadow: 'var(--shadow-glow-sm)',
};
