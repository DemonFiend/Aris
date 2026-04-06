import { useState, useEffect, useCallback } from 'react';
import { ProviderSettings } from './ProviderSettings';
import { AvatarSettings } from './AvatarSettings';
import { CapturePanel } from './CapturePanel';
import { VoiceSettings } from './VoiceSettings';

type Tab = 'providers' | 'avatar' | 'voice' | 'capture' | 'general' | 'data';

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
    { key: 'general', label: 'General' },
    { key: 'data', label: 'Data' },
  ];

  return (
    <div style={{ padding: '1rem' }}>
      <div style={tabBarStyle}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              ...tabBtnStyle,
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === t.key ? '#fff' : '#888',
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
            <span style={{ color: '#e55' }}>Delete all data</span>
            {!confirmWipe ? (
              <button
                onClick={() => setConfirmWipe(true)}
                style={{ ...actionBtnStyle, background: '#522', color: '#e88' }}
              >
                Wipe
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button onClick={handleWipe} style={{ ...actionBtnStyle, background: '#a22', color: '#fff' }}>
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
  gap: '0.25rem',
  marginBottom: '1rem',
  borderBottom: '1px solid #333',
};

const tabBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '0.5rem 0.75rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const sectionStyle: React.CSSProperties = {
  padding: '0.5rem 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '1rem',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.4rem 0',
  fontSize: '0.9rem',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  margin: '0.15rem 0 0',
};

const actionBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '0.25rem 0.6rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

function toggleBtnStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? '#2563eb' : '#333',
    color: '#fff',
    border: '1px solid ' + (on ? '#2563eb' : '#555'),
    borderRadius: '4px',
    padding: '0.25rem 0.6rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    minWidth: '40px',
  };
}
