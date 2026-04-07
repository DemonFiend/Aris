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
      <button onClick={onNew} style={newBtnStyle}>
        + New Chat
      </button>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      <div style={listStyle}>
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              ...itemStyle,
              background: c.id === activeId ? 'var(--bg-active)' : 'transparent',
              borderLeft: c.id === activeId ? '2px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            <div style={titleStyle}>{c.title}</div>
            <div style={metaStyle}>
              {new Date(c.updatedAt).toLocaleDateString()}
              <button
                onClick={(e) => handleDelete(e, c.id)}
                style={deleteBtnStyle}
                title="Delete"
              >
                x
              </button>
            </div>
          </div>
        ))}
        {conversations.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 'var(--sidebar-width)',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-base)',
  flexShrink: 0,
};

const newBtnStyle: React.CSSProperties = {
  margin: 'var(--space-2)',
  padding: 'var(--space-2)',
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const searchStyle: React.CSSProperties = {
  margin: '0 var(--space-2) var(--space-2)',
  padding: 'var(--space-1) var(--space-2)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  padding: 'var(--space-2)',
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
  fontSize: 'var(--text-xs)',
  padding: '0 var(--space-1)',
};
