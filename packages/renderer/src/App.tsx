import { useState, useCallback } from 'react';
import { APP_NAME } from '@aris/shared';
import { SettingsPanel } from './SettingsPanel';
import { ChatPanel } from './ChatPanel';
import { ConversationSidebar } from './ConversationSidebar';

type View = 'chat' | 'settings';

export function App() {
  const [view, setView] = useState<View>('chat');
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversation(id);
    setSidebarKey((k) => k + 1); // refresh sidebar list
  }, []);

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{APP_NAME}</h1>
        <button
          onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          style={navBtnStyle}
        >
          {view === 'settings' ? 'Back' : 'Settings'}
        </button>
      </header>

      <div style={bodyStyle}>
        {view === 'chat' && (
          <>
            <ConversationSidebar
              key={sidebarKey}
              activeId={activeConversation}
              onSelect={setActiveConversation}
              onNew={handleNewChat}
            />
            <ChatPanel
              conversationId={activeConversation}
              onConversationCreated={handleConversationCreated}
            />
          </>
        )}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  color: '#eee',
  background: '#111',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #333',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #444',
  color: '#ccc',
  borderRadius: '4px',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
};
