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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Password lock state
  const [lockState, setLockState] = useState<'loading' | 'locked-startup' | 'locked-enable' | 'unlocked'>('loading');
  const [arisActive, setArisActive] = useState(true);
  const [passwordConfig, setPasswordConfig] = useState<PasswordConfig | null>(null);

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
    setSidebarOpen(false);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversation(id);
    setSidebarKey((k) => k + 1);
  }, []);

  const handleConversationSelect = useCallback((id: string) => {
    setActiveConversation(id);
    setSidebarOpen(false);
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
      setArisActive(false);
      return;
    }
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
      {/* ── Title Bar ───────────────────────────────── */}
      <header style={headerStyle}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={iconBtnStyle}
          title="Chat history"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <h1 style={titleTextStyle}>{APP_NAME}</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <button onClick={toggleActive} style={activeBtnStyle(arisActive)}>
            {arisActive ? 'Active' : 'Disabled'}
          </button>
          <button
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
            style={iconBtnStyle}
            title={view === 'settings' ? 'Back to chat' : 'Settings'}
          >
            {view === 'settings' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Sidebar Drawer ──────────────────────────── */}
      {sidebarOpen && (
        <div style={drawerOverlayStyle} onClick={() => setSidebarOpen(false)}>
          <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
            <ConversationSidebar
              key={sidebarKey}
              activeId={activeConversation}
              onSelect={handleConversationSelect}
              onNew={handleNewChat}
            />
          </div>
        </div>
      )}

      {/* ── Main Content ────────────────────────────── */}
      <div style={bodyStyle}>
        {view === 'chat' && (
          <div style={chatLayoutStyle}>
            {/* Avatar — dominant focal point */}
            <div style={avatarAreaStyle}>
              <AvatarDisplay lastAssistantMessage={lastAssistantMsg} />
              {!arisActive && (
                <div style={disabledOverlayStyle}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-lg)' }}>
                    Aris is disabled
                  </p>
                  <button onClick={toggleActive} style={enableBtnStyle}>
                    Enable
                  </button>
                </div>
              )}
            </div>

            {/* Chat panel: collapsible messages + input bar */}
            {arisActive && (
              <ChatPanel
                conversationId={activeConversation}
                onConversationCreated={handleConversationCreated}
                onAssistantMessage={setLastAssistantMsg}
              />
            )}
          </div>
        )}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────── */

const rootStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--text-primary)',
  background: 'var(--bg-canvas)',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle = {
  height: 'var(--header-height)',
  padding: '0 var(--space-4)',
  borderBottom: '1px solid var(--border-subtle)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexShrink: 0,
  background: 'var(--bg-base)',
  WebkitAppRegion: 'drag',
  position: 'relative',
  zIndex: 20,
} as React.CSSProperties;

const titleTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--font-bold)' as any,
  color: 'var(--text-accent)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as any,
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
};

const iconBtnStyle = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  transition: 'var(--transition-fast)',
  WebkitAppRegion: 'no-drag',
  flexShrink: 0,
} as React.CSSProperties;

function activeBtnStyle(active: boolean) {
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
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties;
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const chatLayoutStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

const avatarAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 200,
  position: 'relative',
  background: 'var(--bg-canvas)',
};

const disabledOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-4)',
  background: 'rgba(6, 13, 23, 0.85)',
  zIndex: 5,
};

const enableBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-2) var(--space-6)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
  boxShadow: 'var(--shadow-glow-sm)',
};

const drawerOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 50,
};

const drawerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width: 280,
  background: 'var(--bg-base)',
  borderRight: '1px solid var(--border-default)',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};
