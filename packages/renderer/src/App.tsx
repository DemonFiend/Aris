import { useState, useCallback } from 'react';
import { APP_NAME } from '@aris/shared';
import { SettingsPanel } from './SettingsPanel';
import { ChatPanel } from './ChatPanel';
import { ConversationSidebar } from './ConversationSidebar';
import { AvatarDisplay } from './AvatarDisplay';

type View = 'chat' | 'settings';

export function App() {
  const [view, setView] = useState<View>('chat');
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [lastAssistantMsg, setLastAssistantMsg] = useState<string | undefined>();

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
            <div style={chatColumnStyle}>
              <div style={avatarPanelStyle}>
                <AvatarDisplay lastAssistantMessage={lastAssistantMsg} />
              </div>
              <ChatPanel
                conversationId={activeConversation}
                onConversationCreated={handleConversationCreated}
                onAssistantMessage={setLastAssistantMsg}
              />
            </div>
          </>
        )}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--text-primary)',
  background: 'var(--bg-base)',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  background: 'var(--bg-base)',
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const chatColumnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

const avatarPanelStyle: React.CSSProperties = {
  height: 200,
  borderBottom: '1px solid var(--border-subtle)',
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};
