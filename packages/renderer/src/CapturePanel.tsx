import { useState, useEffect, useCallback } from 'react';
import type { CaptureSource, CaptureStatus, CaptureSettings, ScreenshotFolderStats } from '@aris/shared';

export function CapturePanel() {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [folderStats, setFolderStats] = useState<ScreenshotFolderStats | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = (await window.aris.invoke('vision:get-capture-settings')) as CaptureSettings;
      setSettings(s);
    } catch { /* ignore */ }
  }, []);

  const loadFolderStats = useCallback(async () => {
    try {
      const stats = (await window.aris.invoke('vision:get-screenshot-stats')) as ScreenshotFolderStats;
      setFolderStats(stats);
    } catch { /* ignore */ }
  }, []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const srcs = (await window.aris.invoke('vision:get-sources')) as CaptureSource[] | undefined;
      setSources(srcs ?? []);
    } catch {
      setSources([]);
    }
    setLoading(false);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = (await window.aris.invoke('vision:get-status')) as CaptureStatus;
      setStatus(s);
      if (s.sourceId) setSelectedSource(s.sourceId);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadSources();
    loadStatus();
    loadSettings();
    loadFolderStats();
  }, [loadSources, loadStatus, loadSettings, loadFolderStats]);

  useEffect(() => {
    const cleanup = window.aris.on('vision:frame', (data: unknown) => {
      const frame = data as { detectedGame?: string; fps: number; frameCount: number };
      setStatus((prev) =>
        prev
          ? { ...prev, detectedGame: frame.detectedGame, fps: frame.fps, frameCount: frame.frameCount }
          : null,
      );
    });
    return cleanup;
  }, []);

  const updateSetting = <K extends keyof CaptureSettings>(key: K, value: CaptureSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try { await window.aris.invoke('vision:set-capture-settings', settings); } catch { /* ignore */ }
    setSaving(false);
  };

  const startCapture = async () => {
    if (!selectedSource || !settings) return;
    try {
      await window.aris.invoke('vision:start-capture', {
        sourceId: selectedSource,
        fps: settings.fps,
        maxWidth: settings.maxWidth,
        maxHeight: settings.maxHeight,
        jpegQuality: settings.jpegQuality,
      });
      await loadStatus();
    } catch { /* ignore */ }
  };

  const stopCapture = async () => {
    await window.aris.invoke('vision:stop-capture');
    await loadStatus();
  };

  const analyzeFrame = async () => {
    try {
      await window.aris.invoke('vision:analyze-frame', 'Describe what you see in this screenshot.');
    } catch { /* ignore */ }
  };

  const pickFolder = async () => {
    try {
      const folder = (await window.aris.invoke('vision:pick-screenshot-folder')) as string | null;
      if (folder) updateSetting('screenshotFolder', folder);
    } catch { /* ignore */ }
  };

  const openFolder = async () => {
    await window.aris.invoke('vision:open-screenshot-folder');
  };

  const pruneNow = async () => {
    const result = (await window.aris.invoke('vision:prune-screenshots')) as { deleted: number };
    if (result.deleted > 0) await loadFolderStats();
  };

  const grantConsent = async () => {
    if (!settings) return;
    const updated = { ...settings, screenCaptureConsented: true };
    setSettings(updated);
    try { await window.aris.invoke('vision:set-capture-settings', updated); } catch { /* ignore */ }
  };

  const revokeConsent = async () => {
    if (!settings) return;
    if (isActive) {
      await window.aris.invoke('vision:stop-capture');
      await loadStatus();
    }
    const updated = { ...settings, screenCaptureConsented: false, heartbeatEnabled: false };
    setSettings(updated);
    try { await window.aris.invoke('vision:set-capture-settings', updated); } catch { /* ignore */ }
  };

  const isActive = status?.active ?? false;
  const hasConsented = settings?.screenCaptureConsented ?? false;

  const filteredSources = settings
    ? sources.filter((s) => settings.captureMode === 'monitor' ? s.isScreen : !s.isScreen)
    : sources;

  if (!settings) return <div style={containerStyle}>Loading settings...</div>;

  // Consent gate
  if (!hasConsented) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Screen Capture</h3>
        <div style={consentBoxStyle}>
          <p style={{ margin: '0 0 var(--space-2)', fontWeight: 'var(--font-semibold)' as any, fontSize: 'var(--text-sm)' }}>
            Privacy Notice
          </p>
          <p style={consentTextStyle}>
            Screen capture records the content of your selected monitor or application window. Captured images are stored
            locally on your device with AES-256 encryption and are never transmitted to external servers. Captures may
            include sensitive content visible on screen (passwords, messages, documents).
          </p>
          <ul style={consentListStyle}>
            <li>Screenshots are saved only to your local disk &mdash; never uploaded</li>
            <li>Captures may include content from any visible application</li>
            <li>All stored screenshots are encrypted at rest</li>
            <li>You can revoke consent and delete captures at any time</li>
          </ul>
          <button onClick={grantConsent} style={primaryBtnStyle}>
            I Understand &mdash; Enable Capture Features
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Screen Capture</h3>

      {/* Status indicator */}
      <div style={statusBarStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={statusDotStyle(isActive)} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' as any }}>
            {isActive ? 'Capturing' : 'Idle'}
          </span>
        </div>
        {isActive && status && (
          <div style={statsBarStyle}>
            {status.detectedGame && <span>Game: <strong>{status.detectedGame}</strong></span>}
            <span>Frames: {status.frameCount}</span>
            <span>FPS: {status.fps}</span>
          </div>
        )}
      </div>

      {/* Capture Mode */}
      <SectionLabel>Capture Mode</SectionLabel>
      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-3)' }}>
        <PillButton active={settings.captureMode === 'monitor'} onClick={() => updateSetting('captureMode', 'monitor')}>Monitor</PillButton>
        <PillButton active={settings.captureMode === 'window'} onClick={() => updateSetting('captureMode', 'window')}>Application</PillButton>
      </div>

      {/* Source Selection */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-1)' }}>
        <SectionLabel>{settings.captureMode === 'monitor' ? 'Select Monitor' : 'Select Application'}</SectionLabel>
        <button onClick={loadSources} disabled={loading} style={chipBtnStyle}>{loading ? '...' : 'Refresh'}</button>
      </div>
      <div style={sourceListStyle}>
        {filteredSources.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 'var(--space-2) 0' }}>
            No {settings.captureMode === 'monitor' ? 'monitors' : 'windows'} found. Click Refresh.
          </p>
        )}
        {filteredSources.map((src) => (
          <button
            key={src.id}
            onClick={() => setSelectedSource(src.id)}
            style={{
              ...sourceItemStyle,
              borderColor: selectedSource === src.id ? 'var(--color-primary)' : 'var(--border-subtle)',
              boxShadow: selectedSource === src.id ? 'var(--shadow-glow-sm)' : 'none',
            }}
          >
            {src.thumbnailDataUrl && (
              <img src={src.thumbnailDataUrl} alt={src.name} style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
            )}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
              {src.name}
            </span>
          </button>
        ))}
      </div>

      {/* Capture controls */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', margin: 'var(--space-3) 0' }}>
        {!isActive ? (
          <button onClick={startCapture} disabled={!selectedSource} style={primaryBtnStyle}>Start Capture</button>
        ) : (
          <>
            <button onClick={stopCapture} style={dangerBtnStyle}>Stop Capture</button>
            <button onClick={analyzeFrame} style={secondaryBtnStyle}>Analyze Frame</button>
          </>
        )}
      </div>

      <div style={dividerStyle} />

      {/* Quality Settings */}
      <SectionLabel>Image Quality</SectionLabel>
      <SliderRow label="JPEG Quality" value={`${settings.jpegQuality}%`} min={10} max={100} step={5} current={settings.jpegQuality} onChange={(v) => updateSetting('jpegQuality', v)} />
      <SliderRow label="Max Width" value={`${settings.maxWidth}px`} min={640} max={3840} step={160} current={settings.maxWidth} onChange={(v) => updateSetting('maxWidth', v)} />
      <SliderRow label="Max Height" value={`${settings.maxHeight}px`} min={360} max={2160} step={90} current={settings.maxHeight} onChange={(v) => updateSetting('maxHeight', v)} />

      <SectionLabel>Capture Frequency</SectionLabel>
      <SliderRow label="FPS" value={`${settings.fps} fps`} min={1} max={10} step={1} current={settings.fps} onChange={(v) => updateSetting('fps', v)} />
      <p style={hintStyle}>Higher FPS = more data for AI analysis but uses more CPU.</p>

      <div style={dividerStyle} />

      {/* Storage */}
      <SectionLabel>Screenshot Storage</SectionLabel>
      <div style={rowStyle}>
        <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)' as any }}>Save to Disk</span>
        <ToggleSwitch on={settings.saveToDisk} onClick={() => updateSetting('saveToDisk', !settings.saveToDisk)} />
      </div>
      {settings.saveToDisk && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', margin: 'var(--space-2) 0' }}>
            <input
              type="text"
              value={settings.screenshotFolder}
              onChange={(e) => updateSetting('screenshotFolder', e.target.value)}
              style={textInputStyle}
            />
            <button onClick={pickFolder} style={chipBtnStyle}>Browse</button>
            <button onClick={openFolder} style={chipBtnStyle}>Open</button>
          </div>
          {folderStats && (
            <div style={statsBarStyle}>
              <span>{folderStats.totalFiles} files</span>
              <span>{folderStats.totalSizeMb} MB</span>
            </div>
          )}

          <SliderRow label="Max Screenshots" value={`${settings.maxScreenshots}`} min={50} max={5000} step={50} current={settings.maxScreenshots} onChange={(v) => updateSetting('maxScreenshots', v)} />
          <SliderRow label="Size Limit" value={`${settings.folderSizeLimitMb} MB`} min={50} max={5000} step={50} current={settings.folderSizeLimitMb} onChange={(v) => updateSetting('folderSizeLimitMb', v)} />
          <SliderRow label="Auto-Prune" value={`${settings.pruneIntervalMinutes}m`} min={5} max={360} step={5} current={settings.pruneIntervalMinutes} onChange={(v) => updateSetting('pruneIntervalMinutes', v)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
            <button onClick={pruneNow} style={chipBtnStyle}>Prune Now</button>
          </div>
        </>
      )}

      <div style={dividerStyle} />

      {/* Heartbeat */}
      <SectionLabel>Heartbeat Captures</SectionLabel>
      <p style={hintStyle}>Periodic screenshots to give AI context about what you're doing.</p>
      <div style={rowStyle}>
        <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)' as any }}>Enabled</span>
        <ToggleSwitch on={settings.heartbeatEnabled} onClick={() => updateSetting('heartbeatEnabled', !settings.heartbeatEnabled)} />
      </div>
      {settings.heartbeatEnabled && (
        <SliderRow label="Interval" value={settings.heartbeatIntervalSeconds >= 60 ? `${Math.round(settings.heartbeatIntervalSeconds / 60)}m` : `${settings.heartbeatIntervalSeconds}s`} min={30} max={28800} step={30} current={settings.heartbeatIntervalSeconds} onChange={(v) => updateSetting('heartbeatIntervalSeconds', v)} />
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
        <button onClick={revokeConsent} style={{ ...chipBtnStyle, color: 'var(--text-muted)' }}>
          Revoke Capture Consent
        </button>
        <button onClick={saveSettings} disabled={saving} style={primaryBtnStyle}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabelStyle}>{children}</div>;
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={pillStyle(active)}>
      {children}
    </button>
  );
}

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={toggleBtnWrapStyle}>
      <span style={toggleTrackStyle(on)}>
        <span style={toggleKnobStyle(on)} />
      </span>
    </button>
  );
}

function SliderRow({ label, value, min, max, step, current, onChange }: {
  label: string; value: string; min: number; max: number; step: number; current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={sliderRowStyle}>
      <span style={sliderLabelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        style={sliderStyle}
      />
      <span style={sliderValueStyle}>{value}</span>
    </div>
  );
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0',
  lineHeight: 'var(--leading-normal)',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 'var(--space-1)',
  marginTop: 'var(--space-2)',
};

const statusBarStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-lg)',
  marginBottom: 'var(--space-3)',
};

function statusDotStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? 'var(--color-success)' : 'var(--text-muted)',
    boxShadow: active ? '0 0 6px var(--color-success)' : 'none',
  };
}

const statsBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) 0',
  gap: 'var(--space-4)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-3) 0',
};

const sliderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-1) 0',
};

const sliderLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  minWidth: 90,
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: 'var(--color-primary)',
};

const sliderValueStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  minWidth: 50,
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
};

const sourceListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
  scrollbarWidth: 'none',
};

const sourceItemStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '2px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-1)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  minWidth: 100,
  maxWidth: 120,
  transition: 'var(--transition-fast)',
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-base)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--text-xs)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
};

const chipBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const consentBoxStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
};

const consentTextStyle: React.CSSProperties = {
  margin: '0 0 var(--space-2)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  lineHeight: 'var(--leading-relaxed)',
};

const consentListStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  paddingLeft: 'var(--space-4)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  lineHeight: 1.8,
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-primary-subtle)' : 'var(--bg-elevated)',
    color: active ? 'var(--color-primary)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-full)',
    padding: 'var(--space-1) var(--space-3)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: active ? 'var(--font-semibold)' as any : 'var(--font-normal)' as any,
    transition: 'var(--transition-fast)',
  };
}

const toggleBtnWrapStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
};

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
