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
      const results = (await window.aris.invoke('conversations:search', search)) as Conversation[];
      setConversations(results);
    } else {
      const list = (await window.aris.invoke('conversations:list', 50, 0)) as Conversation[];
      setConversations(list);
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
              background: c.id === activeId ? '#2a2a3a' : 'transparent',
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
          <div style={{ color: '#666', padding: '0.5rem', fontSize: '0.8rem' }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: '220px',
  borderRight: '1px solid #333',
  display: 'flex',
  flexDirection: 'column',
  background: '#0d0d0d',
  flexShrink: 0,
};

const newBtnStyle: React.CSSProperties = {
  margin: '0.5rem',
  padding: '0.4rem',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const searchStyle: React.CSSProperties = {
  margin: '0 0.5rem 0.5rem',
  padding: '0.35rem 0.5rem',
  background: '#1a1a1a',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: '4px',
  fontSize: '0.8rem',
  outline: 'none',
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

const itemStyle: React.CSSProperties = {
  padding: '0.5rem',
  cursor: 'pointer',
  borderBottom: '1px solid #222',
};

const titleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#ddd',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const metaStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: '#666',
  marginTop: '0.15rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: '0 0.25rem',
};
