import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatChunk } from '@aris/shared';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamBufferRef = useRef('');

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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

  return (
    <div style={containerStyle}>
      <div style={messageListStyle}>
        {messages.length === 0 && (
          <div style={emptyStyle}>
            <p style={{ fontSize: '1.2rem', margin: '0 0 0.5rem' }}>Hey! I'm Aris.</p>
            <p style={{ color: '#888', margin: 0 }}>Your AI gaming companion. Ask me anything.</p>
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
  height: 'calc(100vh - 49px)',
};

const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#aaa',
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
  padding: '0.5rem 0.75rem',
  borderRadius: '12px',
  fontSize: '0.9rem',
  lineHeight: '1.4',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const userBubble: React.CSSProperties = {
  ...bubbleBase,
  background: '#2563eb',
  color: '#fff',
  borderBottomRightRadius: '4px',
};

const assistantBubble: React.CSSProperties = {
  ...bubbleBase,
  background: '#2a2a2a',
  color: '#e0e0e0',
  borderBottomLeftRadius: '4px',
};

const inputAreaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
  borderTop: '1px solid #333',
  background: '#1a1a1a',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  resize: 'none',
  background: '#222',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: '8px',
  padding: '0.5rem 0.75rem',
  fontSize: '0.9rem',
  fontFamily: 'inherit',
  outline: 'none',
};

const sendBtnStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};
