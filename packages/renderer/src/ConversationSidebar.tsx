import { useState, useEffect, useCallback } from 'react';
import type { Conversation } from '@aris/shared';

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationSidebar({ activeId, onSelect, onNew }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (search.trim()) {
      const results = (await window.aris.invoke('conversations:search', search)) as Conversation[] | undefined;
      setConversations(results ?? []);
    } else {
      const list = (await window.aris.invoke('conversations:list', 50, 0)) as Conversation[] | undefined;
      setConversations(list ?? []);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await window.aris.invoke('conversations:delete', id);
    load();
    if (activeId === id) onNew();
  };

  return (
    <div style={sidebarStyle}>
      <div style={drawerHeaderStyle}>
        <h2 style={drawerTitleStyle}>Chat History</h2>
      </div>

      <button onClick={onNew} style={newBtnStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Chat
      </button>

      <div style={searchWrapStyle}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      <div style={listStyle}>
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              ...itemStyle,
              background: c.id === activeId ? 'var(--bg-active)' : 'transparent',
              borderLeft: c.id === activeId ? '3px solid var(--color-primary)' : '3px solid transparent',
            }}
          >
            <div style={titleStyle}>{c.title}</div>
            <div style={metaStyle}>
              <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
              <button
                onClick={(e) => handleDelete(e, c.id)}
                style={deleteBtnStyle}
                title="Delete conversation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: 'var(--space-4)', fontSize: 'var(--text-sm)', textAlign: 'center' as any }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-base)',
};

const drawerHeaderStyle: React.CSSProperties = {
  padding: 'var(--space-4) var(--space-4) var(--space-2)',
};

const drawerTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-accent)',
};

const newBtnStyle: React.CSSProperties = {
  margin: '0 var(--space-3) var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-lg)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  justifyContent: 'center',
};

const searchWrapStyle: React.CSSProperties = {
  margin: '0 var(--space-3) var(--space-2)',
  padding: 'var(--space-1) var(--space-2)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  color: 'var(--text-primary)',
  border: 'none',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  padding: 'var(--space-1) 0',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  borderBottom: '1px solid var(--border-subtle)',
  transition: 'var(--transition-fast)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginTop: 'var(--space-1)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 'var(--space-1)',
  display: 'flex',
  alignItems: 'center',
  borderRadius: 'var(--radius-sm)',
  transition: 'var(--transition-fast)',
};
