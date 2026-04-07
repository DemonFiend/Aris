import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatChunk, StoredMessage } from '@aris/shared';
import { VoiceControls } from './VoiceControls';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onAssistantMessage?: (text: string) => void;
}

export function ChatPanel({ conversationId, onConversationCreated, onAssistantMessage }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamBufferRef = useRef('');
  const activeConvRef = useRef<string | null>(conversationId);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load messages when conversation changes
  useEffect(() => {
    activeConvRef.current = conversationId;
    if (!conversationId) {
      setMessages([]);
      return;
    }
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
  }, [conversationId]);

  useEffect(() => {
    const cleanup = window.aris.on('ai:stream-chunk', (chunk: unknown) => {
      const { text, done } = chunk as ChatChunk;
      if (text) {
        streamBufferRef.current += text;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: streamBufferRef.current };
          }
          return updated;
        });
      }
      if (done) {
        setStreaming(false);
        // Persist the completed assistant message
        const finalContent = streamBufferRef.current;
        const convId = activeConvRef.current;
        if (convId && finalContent) {
          window.aris.invoke('messages:add', convId, 'assistant', finalContent);
          onAssistantMessage?.(finalContent);
        }
        streamBufferRef.current = '';
      }
    });
    return cleanup;
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setInput('');
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    streamBufferRef.current = '';

    // Create conversation if none active
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

    // Persist user message
    await window.aris.invoke('messages:add', convId, 'user', text);

    try {
      const chatMessages = [...messages, userMsg].map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      await window.aris.invoke('ai:stream-chat', chatMessages, {
        systemPrompt:
          'You are Aris, a friendly and knowledgeable AI gaming companion. You help players with tips, strategies, lore, and conversation. Be concise and enthusiastic.',
      });
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: 'Failed to get a response. Check your AI provider settings.',
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
      <div style={messageListStyle}>
        {messages.length === 0 && (
          <div style={emptyStyle}>
            <p style={{ fontSize: 'var(--text-xl)', margin: '0 0 var(--space-2)', color: 'var(--text-primary)' }}>Hey! I'm Aris.</p>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Your AI gaming companion. Ask me anything.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={msg.role === 'user' ? userBubbleWrap : assistantBubbleWrap}>
            <div style={msg.role === 'user' ? userBubble : assistantBubble}>
              {msg.content || (streaming && i === messages.length - 1 ? thinkingDot : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={inputAreaStyle}>
        <VoiceControls onTranscript={handleVoiceTranscript} />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={streaming ? 'Aris is thinking...' : 'Message Aris...'}
          disabled={streaming}
          rows={1}
          style={textareaStyle}
        />
        <button onClick={sendMessage} disabled={streaming || !input.trim()} style={sendBtnStyle}>
          Send
        </button>
      </div>
    </div>
  );
}

const thinkingDot = '\u2026';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
};

const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
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
  maxWidth: '80%',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-xl)',
  fontSize: 'var(--text-base)',
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

const inputAreaStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  padding: 'var(--space-3) var(--space-4)',
  borderTop: '1px solid var(--border-subtle)',
  background: 'var(--bg-base)',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-base)',
  fontFamily: 'inherit',
  outline: 'none',
};

const sendBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-bold)' as any,
  transition: 'var(--transition-fast)',
};
