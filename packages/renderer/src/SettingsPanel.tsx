import { useState, useEffect, useCallback } from 'react';
import { ProviderSettings } from './ProviderSettings';
import { AvatarSettings } from './AvatarSettings';
import { CapturePanel } from './CapturePanel';
import { VoiceSettings } from './VoiceSettings';
import { SecuritySettings } from './SecuritySettings';

type Tab = 'providers' | 'avatar' | 'voice' | 'capture' | 'security' | 'general' | 'data';

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('providers');
  const [overlayMode, setOverlayMode] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'done'>('idle');

  const loadState = useCallback(async () => {
    const overlay = (await window.aris.invoke('window:get-overlay')) as boolean;
    setOverlayMode(overlay);
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const toggleOverlay = async () => {
    const newState = (await window.aris.invoke('window:toggle-overlay')) as boolean;
    setOverlayMode(newState);
  };

  const handleExport = async () => {
    const data = await window.aris.invoke('data:export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aris-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus('done');
    setTimeout(() => setExportStatus('idle'), 2000);
  };

  const handleWipe = async () => {
    await window.aris.invoke('data:wipe');
    setConfirmWipe(false);
    window.location.reload();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'providers', label: 'AI Providers' },
    { key: 'avatar', label: 'Avatar' },
    { key: 'voice', label: 'Voice' },
    { key: 'capture', label: 'Capture' },
    { key: 'security', label: 'Security' },
    { key: 'general', label: 'General' },
    { key: 'data', label: 'Data' },
  ];

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <div style={tabBarStyle}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...tabBtnStyle,
              borderBottom: tab === t.key ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'providers' && <ProviderSettings />}

      {tab === 'avatar' && <AvatarSettings />}

      {tab === 'voice' && <VoiceSettings />}

      {tab === 'capture' && <CapturePanel />}

      {tab === 'security' && <SecuritySettings />}

      {tab === 'general' && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Window</h3>
          <div style={rowStyle}>
            <span>Overlay mode (always on top)</span>
            <button onClick={toggleOverlay} style={toggleBtnStyle(overlayMode)}>
              {overlayMode ? 'ON' : 'OFF'}
            </button>
          </div>
          <p style={hintStyle}>
            Overlay mode keeps Aris visible over your game with slight transparency.
          </p>

          <div style={{ ...rowStyle, marginTop: '1rem' }}>
            <span>Minimize to tray</span>
            <button
              onClick={() => window.aris.invoke('window:minimize-to-tray')}
              style={actionBtnStyle}
            >
              Minimize
            </button>
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div style={sectionStyle}>
          <h3 style={headingStyle}>Data Management</h3>

          <div style={rowStyle}>
            <span>Export all data</span>
            <button onClick={handleExport} style={actionBtnStyle}>
              {exportStatus === 'done' ? 'Exported!' : 'Export JSON'}
            </button>
          </div>
          <p style={hintStyle}>
            Downloads all conversations, settings, and game profiles as JSON.
          </p>

          <div style={{ ...rowStyle, marginTop: '1.5rem' }}>
            <span style={{ color: 'var(--color-error)' }}>Delete all data</span>
            {!confirmWipe ? (
              <button
                onClick={() => setConfirmWipe(true)}
                style={{ ...actionBtnStyle, background: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid rgba(255,83,112,0.3)' }}
              >
                Wipe
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <button onClick={handleWipe} style={{ ...actionBtnStyle, background: 'var(--color-error)', color: 'var(--text-primary)' }}>
                  Confirm Delete
                </button>
                <button onClick={() => setConfirmWipe(false)} style={actionBtnStyle}>
                  Cancel
                </button>
              </div>
            )}
          </div>
          <p style={hintStyle}>
            Permanently deletes the database. This cannot be undone.
          </p>
        </div>
      )}
    </div>
  );
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-4)',
  borderBottom: '1px solid var(--border-subtle)',
};

const tabBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const sectionStyle: React.CSSProperties = {
  padding: 'var(--space-2) 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-1) 0',
  fontSize: 'var(--text-base)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};

function toggleBtnStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? 'var(--color-primary)' : 'var(--bg-surface)',
    color: on ? 'var(--color-primary-on)' : 'var(--text-primary)',
    border: '1px solid ' + (on ? 'var(--color-primary)' : 'var(--border-default)'),
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-3)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)' as any,
    minWidth: '40px',
    transition: 'var(--transition-fast)',
  };
}
