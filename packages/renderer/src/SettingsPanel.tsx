import { useState, useEffect, useCallback } from 'react';
import { ProviderSettings } from './ProviderSettings';
import { AvatarSettings } from './AvatarSettings';
import { IdleSettings } from './IdleSettings';
import { CapturePanel } from './CapturePanel';
import { VoiceSettings } from './VoiceSettings';
import { SecuritySettings } from './SecuritySettings';
import { PersonaSettings } from './PersonaSettings';
import type { ScreenPositionMode, MonitorInfo, ScreenPositionState, VirtualSpaceConfig } from '@aris/shared';

type Tab = 'providers' | 'persona' | 'avatar' | 'voice' | 'capture' | 'security' | 'general' | 'data';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'providers', label: 'AI Providers', icon: '\u2728' },
  { key: 'persona', label: 'Persona', icon: '\uD83C\uDFAD' },
  { key: 'avatar', label: 'Avatar', icon: '\uD83D\uDC64' },
  { key: 'voice', label: 'Voice', icon: '\uD83C\uDF99' },
  { key: 'capture', label: 'Capture', icon: '\uD83D\uDCF7' },
  { key: 'security', label: 'Security', icon: '\uD83D\uDD12' },
  { key: 'general', label: 'General', icon: '\u2699' },
  { key: 'data', label: 'Data', icon: '\uD83D\uDCBE' },
];

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('providers');
  const [overlayMode, setOverlayMode] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'done'>('idle');
  const [screenMode, setScreenMode] = useState<ScreenPositionMode>('disabled');
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [customPositions, setCustomPositions] = useState<Record<number, number | null>>({});
  const [liveScreenState, setLiveScreenState] = useState<ScreenPositionState | null>(null);
  const [pendingMode, setPendingMode] = useState<ScreenPositionMode | null>(null);
  const [spaceConfig, setSpaceConfig] = useState<VirtualSpaceConfig | null>(null);

  const loadState = useCallback(async () => {
    const overlay = (await window.aris.invoke('window:get-overlay')) as boolean;
    setOverlayMode(overlay);
    try {
      const state = (await window.aris.invoke('screen:get-position-state')) as ScreenPositionState;
      setScreenMode(state.mode);
      setMonitors(state.monitors);
      setCustomPositions(state.positions);
      setLiveScreenState(state);
    } catch {
      // Screen position backend not yet available (ARI-133)
    }
    try {
      const cfg = (await window.aris.invoke('avatar:get-space-config')) as VirtualSpaceConfig;
      setSpaceConfig(cfg);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    return window.aris.on('screen:position-changed', (state: unknown) => {
      setLiveScreenState(state as ScreenPositionState);
    });
  }, []);

  const toggleOverlay = async () => {
    const newState = (await window.aris.invoke('window:toggle-overlay')) as boolean;
    setOverlayMode(newState);
  };

  const handleScreenModeChange = (mode: ScreenPositionMode) => {
    if (screenMode === 'disabled' && mode !== 'disabled') {
      setPendingMode(mode);
    } else {
      void applyScreenMode(mode);
    }
  };

  const applyScreenMode = async (mode: ScreenPositionMode) => {
    try {
      await window.aris.invoke('screen:set-mode', mode);
      setScreenMode(mode);
      if (mode === 'custom') {
        const state = (await window.aris.invoke('screen:get-position-state')) as ScreenPositionState;
        setMonitors(state.monitors);
        setCustomPositions(state.positions);
      }
    } catch {
      // ignore
    }
    setPendingMode(null);
  };

  const handleSetCustomPosition = async (monitorIndex: number, cell: number) => {
    try {
      await window.aris.invoke('screen:set-custom-position', monitorIndex, cell);
      setCustomPositions(prev => ({ ...prev, [monitorIndex]: cell }));
    } catch {
      // ignore
    }
  };

  const toggleVirtualSpace = async () => {
    const next = { ...(spaceConfig ?? {}), enabled: !(spaceConfig?.enabled ?? false) };
    const updated = (await window.aris.invoke('avatar:set-space-config', next)) as VirtualSpaceConfig;
    setSpaceConfig(updated);
  };

  const handleExport = async () => {
    const filePath = await window.aris.invoke('data:export-encrypted');
    if (filePath) {
      setExportStatus('done');
      setTimeout(() => setExportStatus('idle'), 2000);
    }
  };

  const handleWipe = async () => {
    await window.aris.invoke('data:wipe');
    setConfirmWipe(false);
    window.location.reload();
  };

  return (
    <div style={shellStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Settings</h1>
        <span style={brandStyle}>Aris</span>
      </div>

      {/* Tab navigation */}
      <div style={tabScrollStyle}>
        <div style={tabBarStyle}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  ...tabPillStyle,
                  ...(active ? tabPillActiveStyle : {}),
                }}
              >
                <span style={{ fontSize: 'var(--text-sm)' }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div style={contentStyle}>
        {tab === 'providers' && (
          <SettingsCard>
            <ProviderSettings />
          </SettingsCard>
        )}

        {tab === 'persona' && (
          <SettingsCard>
            <PersonaSettings />
          </SettingsCard>
        )}

        {tab === 'avatar' && (
          <>
            <SettingsCard>
              <AvatarSettings />
            </SettingsCard>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <SettingsCard>
                <IdleSettings />
              </SettingsCard>
            </div>
            <div style={{ marginTop: 'var(--space-3)' }}>
              <SettingsCard>
                <div style={cardInnerStyle}>
                  <h3 style={sectionHeadingStyle}>Virtual Space</h3>
                  <SettingRow
                    label="Ground plane"
                    description="Show a virtual floor with grid, shadows, and optional background"
                  >
                    <ToggleButton on={spaceConfig?.enabled ?? false} onClick={() => void toggleVirtualSpace()} />
                  </SettingRow>
                </div>
              </SettingsCard>
            </div>
          </>
        )}

        {tab === 'voice' && (
          <SettingsCard>
            <VoiceSettings />
          </SettingsCard>
        )}

        {tab === 'capture' && (
          <SettingsCard>
            <CapturePanel />
          </SettingsCard>
        )}

        {tab === 'security' && (
          <SettingsCard>
            <SecuritySettings />
          </SettingsCard>
        )}

        {tab === 'general' && (
          <SettingsCard>
            <div style={cardInnerStyle}>
              <h3 style={sectionHeadingStyle}>Window</h3>

              <SettingRow
                label="Overlay mode"
                description="Keeps Aris visible over your game with slight transparency"
              >
                <ToggleButton on={overlayMode} onClick={toggleOverlay} />
              </SettingRow>

              <SettingRow label="Minimize to tray" description="Hide Aris to the system tray">
                <button
                  onClick={() => window.aris.invoke('window:minimize-to-tray')}
                  style={secondaryBtnStyle}
                >
                  Minimize
                </button>
              </SettingRow>

              <div style={dividerStyle} />
              <h3 style={{ ...sectionHeadingStyle, marginTop: 'var(--space-3)' }}>Screen Position</h3>

              <SettingRow
                label="Position awareness"
                description="Let AI know where Aris is positioned on your screen"
              >
                <div style={segmentedControlStyle}>
                  {(['disabled', 'auto', 'custom'] as ScreenPositionMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => handleScreenModeChange(mode)}
                      style={{
                        ...segmentBtnStyle,
                        ...(screenMode === mode ? segmentBtnActiveStyle : {}),
                      }}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {pendingMode !== null && (
                <div style={warningBannerStyle}>
                  <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                    Position tracking shares your screen layout information with the AI. This is off by default for privacy.
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      onClick={() => void applyScreenMode(pendingMode)}
                      style={warningConfirmBtnStyle}
                    >
                      Enable
                    </button>
                    <button onClick={() => setPendingMode(null)} style={secondaryBtnStyle}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {screenMode === 'auto' && liveScreenState && liveScreenState.activeMonitorIndex !== null && (
                <div style={autoIndicatorStyle}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Currently on Monitor {liveScreenState.activeMonitorIndex + 1}
                    {liveScreenState.activeGridCell !== null
                      ? ` \u2014 ${CELL_LABEL[liveScreenState.activeGridCell]}`
                      : ''}
                  </span>
                </div>
              )}

              {screenMode === 'custom' && monitors.length > 0 && (
                <div style={monitorGridsRowStyle}>
                  {monitors.map((monitor) => (
                    <MonitorGrid
                      key={monitor.index}
                      monitor={monitor}
                      selectedCell={customPositions[monitor.index] ?? null}
                      onSelect={(cell) => void handleSetCustomPosition(monitor.index, cell)}
                    />
                  ))}
                </div>
              )}
            </div>
          </SettingsCard>
        )}

        {tab === 'data' && (
          <SettingsCard>
            <div style={cardInnerStyle}>
              <h3 style={sectionHeadingStyle}>Data Management</h3>

              <SettingRow
                label="Export all data"
                description="Saves an encrypted backup of all conversations, settings, and game profiles"
              >
                <button onClick={handleExport} style={secondaryBtnStyle}>
                  {exportStatus === 'done' ? 'Exported!' : 'Export Backup'}
                </button>
              </SettingRow>

              <div style={dividerStyle} />

              <SettingRow
                label={<span style={{ color: 'var(--color-error)' }}>Delete all data</span>}
                description="Permanently deletes the database. This cannot be undone."
              >
                {!confirmWipe ? (
                  <button onClick={() => setConfirmWipe(true)} style={dangerBtnStyle}>
                    Wipe
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    <button
                      onClick={handleWipe}
                      style={{ ...dangerBtnStyle, background: 'var(--color-error)', color: '#fff' }}
                    >
                      Confirm
                    </button>
                    <button onClick={() => setConfirmWipe(false)} style={secondaryBtnStyle}>
                      Cancel
                    </button>
                  </div>
                )}
              </SettingRow>
            </div>
          </SettingsCard>
        )}
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <div style={cardStyle}>{children}</div>;
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={settingRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)' as any }}>
          {label}
        </div>
        {description && <p style={descStyle}>{description}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function ToggleButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={toggleBtnStyle(on)}>
      <span style={toggleTrackStyle(on)}>
        <span style={toggleKnobStyle(on)} />
      </span>
    </button>
  );
}

const CELL_LABEL: Record<number, string> = {
  1: 'top-left', 2: 'top-center', 3: 'top-right',
  4: 'middle-left', 5: 'center', 6: 'middle-right',
  7: 'bottom-left', 8: 'bottom-center', 9: 'bottom-right',
};

function MonitorGrid({
  monitor,
  selectedCell,
  onSelect,
}: {
  monitor: MonitorInfo;
  selectedCell: number | null;
  onSelect: (cell: number) => void;
}) {
  return (
    <div style={monitorCardStyle}>
      <div style={monitorCardLabelStyle}>
        <span>{monitor.label}</span>
        {monitor.isPrimary && <span style={primaryBadgeStyle}>Primary</span>}
      </div>
      <div style={gridContainerStyle}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((cell) => (
          <button
            key={cell}
            title={CELL_LABEL[cell]}
            onClick={() => onSelect(cell)}
            style={gridCellButtonStyle(selectedCell === cell)}
          >
            <span style={gridCellDotStyle(selectedCell === cell)} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Styles ── */

const shellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: 'var(--space-4) var(--space-4) var(--space-2)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--font-bold)' as any,
  color: 'var(--text-primary)',
};

const brandStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-bold)' as any,
  color: 'var(--color-primary)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const tabScrollStyle: React.CSSProperties = {
  overflowX: 'auto',
  overflowY: 'hidden',
  padding: '0 var(--space-4)',
  scrollbarWidth: 'none',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  paddingBottom: 'var(--space-2)',
};

const tabPillStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  transition: 'var(--transition-fast)',
};

const tabPillActiveStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  border: '1px solid var(--border-default)',
  color: 'var(--color-primary)',
  fontWeight: 'var(--font-semibold)' as any,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 var(--space-4) var(--space-4)',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',
  overflow: 'hidden',
};

const cardInnerStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const settingRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-3) 0',
  gap: 'var(--space-4)',
};

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
  lineHeight: 'var(--leading-normal)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 0,
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

function toggleBtnStyle(on: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  };
}

function toggleTrackStyle(on: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: 36,
    height: 20,
    borderRadius: 'var(--radius-full)',
    background: on ? 'var(--color-primary)' : 'var(--bg-overlay)',
    padding: 2,
    transition: 'var(--transition-normal)',
    boxShadow: on ? 'var(--shadow-glow-sm)' : 'none',
  };
}

function toggleKnobStyle(on: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: on ? '#fff' : 'var(--text-muted)',
    transition: 'var(--transition-normal)',
    transform: on ? 'translateX(16px)' : 'translateX(0)',
    boxShadow: 'var(--shadow-sm)',
  };
}

const segmentedControlStyle: React.CSSProperties = {
  display: 'flex',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
};

const segmentBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRight: '1px solid var(--border-subtle)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  transition: 'var(--transition-fast)',
};

const segmentBtnActiveStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  color: 'var(--color-primary)',
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
};

const warningBannerStyle: React.CSSProperties = {
  background: 'rgba(255, 180, 0, 0.08)',
  border: '1px solid rgba(255, 180, 0, 0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  marginTop: 'var(--space-2)',
};

const warningConfirmBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 180, 0, 0.15)',
  color: 'var(--text-primary)',
  border: '1px solid rgba(255, 180, 0, 0.4)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const autoIndicatorStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  marginTop: 'var(--space-2)',
};

const monitorGridsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  paddingTop: 'var(--space-2)',
};

const monitorCardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2)',
  minWidth: 96,
};

const monitorCardLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-2)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
  color: 'var(--text-secondary)',
};

const primaryBadgeStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  color: 'var(--color-primary)',
  fontSize: '0.6rem',
  fontWeight: 'var(--font-bold)' as React.CSSProperties['fontWeight'],
  borderRadius: 'var(--radius-full)',
  padding: '1px 5px',
};

const gridContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 3,
};

function gridCellButtonStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    background: selected ? 'var(--color-primary-subtle)' : 'var(--bg-overlay)',
    border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
    padding: 0,
  };
}

function gridCellDotStyle(selected: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: selected ? 'var(--color-primary)' : 'var(--border-default)',
    transition: 'var(--transition-fast)',
  };
}
