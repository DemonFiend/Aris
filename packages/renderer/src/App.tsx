import { useState, useCallback, useEffect } from 'react';
import { APP_NAME } from '@aris/shared';
import type { PasswordConfig } from '@aris/shared';
import { SettingsPanel } from './SettingsPanel';
import { ChatPanel } from './ChatPanel';
import { ConversationSidebar } from './ConversationSidebar';
import { AvatarDisplay } from './AvatarDisplay';
import { LockScreen } from './LockScreen';

type View = 'chat' | 'settings';

export function App() {
  const [view, setView] = useState<View>('chat');
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [lastAssistantMsg, setLastAssistantMsg] = useState<string | undefined>();

  // Password lock state
  const [lockState, setLockState] = useState<'loading' | 'locked-startup' | 'locked-enable' | 'unlocked'>('loading');
  const [arisActive, setArisActive] = useState(true);
  const [passwordConfig, setPasswordConfig] = useState<PasswordConfig | null>(null);

  // Check startup lock on mount
  useEffect(() => {
    (async () => {
      try {
        const config = (await window.aris.invoke('password:get-config')) as PasswordConfig | undefined;
        if (!config) {
          setLockState('unlocked');
          return;
        }
        setPasswordConfig(config);
        if (config.enabled && config.hasPassword && config.onStart) {
          setLockState('locked-startup');
        } else {
          setLockState('unlocked');
        }
      } catch {
        setLockState('unlocked');
      }
    })();
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversation(null);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversation(id);
    setSidebarKey((k) => k + 1);
  }, []);

  const handleStartupUnlock = useCallback(() => {
    setLockState('unlocked');
  }, []);

  const handleEnableUnlock = useCallback(() => {
    setLockState('unlocked');
    setArisActive(true);
  }, []);

  const toggleActive = useCallback(async () => {
    if (arisActive) {
      // Disabling — no password needed
      setArisActive(false);
      return;
    }

    // Enabling — check if password is required
    try {
      const config = (await window.aris.invoke('password:get-config')) as PasswordConfig | undefined;
      setPasswordConfig(config ?? null);
      if (config?.enabled && config.hasPassword && config.onEnable) {
        setLockState('locked-enable');
      } else {
        setArisActive(true);
      }
    } catch {
      setArisActive(true);
    }
  }, [arisActive]);

  // Show lock screen for startup
  if (lockState === 'loading') {
    return (
      <div style={{ ...rootStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    );
  }

  if (lockState === 'locked-startup') {
    return <LockScreen purpose="startup" onUnlock={handleStartupUnlock} />;
  }

  if (lockState === 'locked-enable') {
    return <LockScreen purpose="enable" onUnlock={handleEnableUnlock} />;
  }

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{APP_NAME}</h1>
          <button onClick={toggleActive} style={activeBtnStyle(arisActive)}>
            {arisActive ? 'Active' : 'Disabled'}
          </button>
        </div>
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
              {arisActive ? (
                <ChatPanel
                  conversationId={activeConversation}
                  onConversationCreated={handleConversationCreated}
                  onAssistantMessage={setLastAssistantMsg}
                />
              ) : (
                <div style={disabledOverlayStyle}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>
                    Aris is disabled
                  </p>
                  <button onClick={toggleActive} style={enableBtnStyle}>
                    Enable
                  </button>
                </div>
              )}
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

function activeBtnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
    color: active ? 'var(--color-success)' : 'var(--color-error)',
    border: '1px solid ' + (active ? 'rgba(0,230,118,0.3)' : 'rgba(255,83,112,0.3)'),
    borderRadius: 'var(--radius-full)',
    padding: 'var(--space-1) var(--space-3)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)' as any,
    transition: 'var(--transition-fast)',
    lineHeight: 1,
  };
}

const disabledOverlayStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
};

const enableBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-5)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};
