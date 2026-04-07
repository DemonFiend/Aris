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
    } catch {
      // ignore
    }
  }, []);

  const loadFolderStats = useCallback(async () => {
    try {
      const stats = (await window.aris.invoke('vision:get-screenshot-stats')) as ScreenshotFolderStats;
      setFolderStats(stats);
    } catch {
      // ignore
    }
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
    } catch {
      // ignore
    }
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
    try {
      await window.aris.invoke('vision:set-capture-settings', settings);
    } catch {
      // ignore
    }
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
    } catch {
      // ignore
    }
  };

  const stopCapture = async () => {
    await window.aris.invoke('vision:stop-capture');
    await loadStatus();
  };

  const analyzeFrame = async () => {
    try {
      await window.aris.invoke('vision:analyze-frame', 'Describe what you see in this screenshot.');
    } catch {
      // ignore
    }
  };

  const pickFolder = async () => {
    try {
      const folder = (await window.aris.invoke('vision:pick-screenshot-folder')) as string | null;
      if (folder) {
        updateSetting('screenshotFolder', folder);
      }
    } catch {
      // ignore
    }
  };

  const openFolder = async () => {
    await window.aris.invoke('vision:open-screenshot-folder');
  };

  const pruneNow = async () => {
    const result = (await window.aris.invoke('vision:prune-screenshots')) as { deleted: number };
    if (result.deleted > 0) {
      await loadFolderStats();
    }
  };

  const grantConsent = async () => {
    if (!settings) return;
    const updated = { ...settings, screenCaptureConsented: true };
    setSettings(updated);
    try {
      await window.aris.invoke('vision:set-capture-settings', updated);
    } catch {
      // ignore
    }
  };

  const revokeConsent = async () => {
    if (!settings) return;
    if (isActive) {
      await window.aris.invoke('vision:stop-capture');
      await loadStatus();
    }
    const updated = { ...settings, screenCaptureConsented: false, heartbeatEnabled: false };
    setSettings(updated);
    try {
      await window.aris.invoke('vision:set-capture-settings', updated);
    } catch {
      // ignore
    }
  };

  const isActive = status?.active ?? false;
  const hasConsented = settings?.screenCaptureConsented ?? false;

  const filteredSources = settings
    ? sources.filter((s) =>
        settings.captureMode === 'monitor' ? s.isScreen : !s.isScreen,
      )
    : sources;

  if (!settings) return <div style={sectionStyle}>Loading settings...</div>;

  // Gate all capture controls behind explicit consent
  if (!hasConsented) {
    return (
      <div style={sectionStyle}>
        <h3 style={headingStyle}>Screen Capture</h3>
        <div style={consentBoxStyle}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 'var(--font-semibold)' as any, fontSize: 'var(--text-sm)' }}>
            Privacy Notice
          </p>
          <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Screen capture records the content of your selected monitor or application window. Captured images are stored
            locally on your device with AES-256 encryption and are never transmitted to external servers. Captures may
            include sensitive content visible on screen (passwords, messages, documents).
          </p>
          <ul style={{ margin: '0 0 var(--space-2)', paddingLeft: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Screenshots are saved only to your local disk — never uploaded</li>
            <li>Captures may include content from any visible application</li>
            <li>All stored screenshots are encrypted at rest</li>
            <li>You can revoke consent and delete captures at any time</li>
          </ul>
          <button onClick={grantConsent} style={consentBtnStyle}>
            I Understand — Enable Capture Features
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <h3 style={headingStyle}>Screen Capture</h3>

      {/* Status */}
      <div style={rowStyle}>
        <span>Status</span>
        <span style={{ color: isActive ? 'var(--color-success)' : 'var(--text-muted)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' as any }}>
          {isActive ? 'Capturing' : 'Idle'}
        </span>
      </div>

      {isActive && status && (
        <div style={statsStyle}>
          {status.detectedGame && (
            <span>Game: <strong>{status.detectedGame}</strong></span>
          )}
          <span>Frames: {status.frameCount}</span>
          <span>FPS: {status.fps}</span>
        </div>
      )}

      {/* 1 & 2: Capture Mode — Monitor vs Window */}
      <div style={groupStyle}>
        <label style={labelStyle}>Capture Mode</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => updateSetting('captureMode', 'monitor')}
            style={pillStyle(settings.captureMode === 'monitor')}
          >
            Monitor
          </button>
          <button
            onClick={() => updateSetting('captureMode', 'window')}
            style={pillStyle(settings.captureMode === 'window')}
          >
            Application
          </button>
        </div>
      </div>

      {/* 1: Source Selection */}
      <div style={groupStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={labelStyle}>
            {settings.captureMode === 'monitor' ? 'Select Monitor' : 'Select Application'}
          </label>
          <button onClick={loadSources} disabled={loading} style={refreshBtnStyle}>
            {loading ? '...' : 'Refresh'}
          </button>
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
                borderColor: selectedSource === src.id ? 'var(--color-primary)' : 'var(--border-muted)',
              }}
            >
              {src.thumbnailDataUrl && (
                <img
                  src={src.thumbnailDataUrl}
                  alt={src.name}
                  style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 3 }}
                />
              )}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                {src.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Capture controls */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
        {!isActive ? (
          <button onClick={startCapture} disabled={!selectedSource} style={actionBtnStyle}>
            Start Capture
          </button>
        ) : (
          <>
            <button onClick={stopCapture} style={{ ...actionBtnStyle, background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              Stop Capture
            </button>
            <button onClick={analyzeFrame} style={actionBtnStyle}>
              Analyze Frame
            </button>
          </>
        )}
      </div>

      <hr style={dividerStyle} />

      {/* 6: Quality Settings */}
      <div style={groupStyle}>
        <label style={labelStyle}>Image Quality</label>
        <div style={sliderRowStyle}>
          <span style={sliderLabelStyle}>JPEG Quality</span>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.jpegQuality}
            onChange={(e) => updateSetting('jpegQuality', Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{settings.jpegQuality}%</span>
        </div>
        <div style={sliderRowStyle}>
          <span style={sliderLabelStyle}>Max Width</span>
          <input
            type="range"
            min={640}
            max={3840}
            step={160}
            value={settings.maxWidth}
            onChange={(e) => updateSetting('maxWidth', Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{settings.maxWidth}px</span>
        </div>
        <div style={sliderRowStyle}>
          <span style={sliderLabelStyle}>Max Height</span>
          <input
            type="range"
            min={360}
            max={2160}
            step={90}
            value={settings.maxHeight}
            onChange={(e) => updateSetting('maxHeight', Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{settings.maxHeight}px</span>
        </div>
      </div>

      {/* 7: Capture Frequency */}
      <div style={groupStyle}>
        <label style={labelStyle}>Capture Frequency</label>
        <div style={sliderRowStyle}>
          <span style={sliderLabelStyle}>FPS</span>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.fps}
            onChange={(e) => updateSetting('fps', Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={sliderValueStyle}>{settings.fps} fps</span>
        </div>
        <p style={hintStyle}>
          Higher FPS = more data for AI analysis but uses more CPU. Screenshots are saved every ~15 seconds at default FPS.
        </p>
      </div>

      <hr style={dividerStyle} />

      {/* 3: Storage Location */}
      <div style={groupStyle}>
        <label style={labelStyle}>Screenshot Storage</label>
        <div style={rowStyle}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Save to Disk</span>
          <button
            onClick={() => updateSetting('saveToDisk', !settings.saveToDisk)}
            style={toggleStyle(settings.saveToDisk)}
          >
            {settings.saveToDisk ? 'ON' : 'OFF'}
          </button>
        </div>
        {settings.saveToDisk && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.4rem 0' }}>
              <input
                type="text"
                value={settings.screenshotFolder}
                onChange={(e) => updateSetting('screenshotFolder', e.target.value)}
                style={textInputStyle}
              />
              <button onClick={pickFolder} style={smallBtnStyle}>Browse</button>
              <button onClick={openFolder} style={smallBtnStyle}>Open</button>
            </div>

            {/* Folder stats */}
            {folderStats && (
              <div style={statsStyle}>
                <span>{folderStats.totalFiles} files</span>
                <span>{folderStats.totalSizeMb} MB</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4: Max screenshots */}
      {settings.saveToDisk && (
        <div style={groupStyle}>
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>Max Screenshots</span>
            <input
              type="range"
              min={50}
              max={5000}
              step={50}
              value={settings.maxScreenshots}
              onChange={(e) => updateSetting('maxScreenshots', Number(e.target.value))}
              style={sliderStyle}
            />
            <span style={sliderValueStyle}>{settings.maxScreenshots}</span>
          </div>

          {/* 10: Folder size limit */}
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>Size Limit</span>
            <input
              type="range"
              min={50}
              max={5000}
              step={50}
              value={settings.folderSizeLimitMb}
              onChange={(e) => updateSetting('folderSizeLimitMb', Number(e.target.value))}
              style={sliderStyle}
            />
            <span style={sliderValueStyle}>{settings.folderSizeLimitMb} MB</span>
          </div>

          {/* 5: Prune Schedule */}
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>Auto-Prune</span>
            <input
              type="range"
              min={5}
              max={360}
              step={5}
              value={settings.pruneIntervalMinutes}
              onChange={(e) => updateSetting('pruneIntervalMinutes', Number(e.target.value))}
              style={sliderStyle}
            />
            <span style={sliderValueStyle}>{settings.pruneIntervalMinutes}m</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={pruneNow} style={smallBtnStyle}>Prune Now</button>
          </div>
        </div>
      )}

      <hr style={dividerStyle} />

      {/* 8: Heartbeat Screenshots */}
      <div style={groupStyle}>
        <label style={labelStyle}>Heartbeat Captures</label>
        <p style={hintStyle}>
          Periodic screenshots to give AI context about what you're doing, even when not actively capturing.
        </p>
        <div style={rowStyle}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Enabled</span>
          <button
            onClick={() => updateSetting('heartbeatEnabled', !settings.heartbeatEnabled)}
            style={toggleStyle(settings.heartbeatEnabled)}
          >
            {settings.heartbeatEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {settings.heartbeatEnabled && (
          <div style={sliderRowStyle}>
            <span style={sliderLabelStyle}>Interval</span>
            <input
              type="range"
              min={10}
              max={600}
              step={10}
              value={settings.heartbeatIntervalSeconds}
              onChange={(e) => updateSetting('heartbeatIntervalSeconds', Number(e.target.value))}
              style={sliderStyle}
            />
            <span style={sliderValueStyle}>{settings.heartbeatIntervalSeconds}s</span>
          </div>
        )}
      </div>

      <hr style={dividerStyle} />

      {/* 9: Video Options */}
      <div style={groupStyle}>
        <label style={labelStyle}>Video Capture</label>
        <div style={rowStyle}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Enabled</span>
          <button
            onClick={() => updateSetting('videoEnabled', !settings.videoEnabled)}
            style={toggleStyle(settings.videoEnabled)}
          >
            {settings.videoEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        {settings.videoEnabled && (
          <>
            <div style={sliderRowStyle}>
              <span style={sliderLabelStyle}>Max Duration</span>
              <input
                type="range"
                min={30}
                max={1800}
                step={30}
                value={settings.videoMaxDurationSeconds}
                onChange={(e) => updateSetting('videoMaxDurationSeconds', Number(e.target.value))}
                style={sliderStyle}
              />
              <span style={sliderValueStyle}>{Math.floor(settings.videoMaxDurationSeconds / 60)}m</span>
            </div>
            <div style={sliderRowStyle}>
              <span style={sliderLabelStyle}>Video FPS</span>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={settings.videoFps}
                onChange={(e) => updateSetting('videoFps', Number(e.target.value))}
                style={sliderStyle}
              />
              <span style={sliderValueStyle}>{settings.videoFps} fps</span>
            </div>
            <div style={sliderRowStyle}>
              <span style={sliderLabelStyle}>Quality</span>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => updateSetting('videoQuality', q)}
                    style={pillStyle(settings.videoQuality === q)}
                  >
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <p style={hintStyle}>
              Video capture is experimental. Recordings use the same source as screenshot capture.
            </p>
          </>
        )}
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
        <button onClick={revokeConsent} style={{ ...smallBtnStyle, color: 'var(--text-muted)' }}>
          Revoke Capture Consent
        </button>
        <button onClick={saveSettings} disabled={saving} style={saveBtnStyle}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

/* ───── Styles ───── */

const sectionStyle: React.CSSProperties = {
  padding: 'var(--space-2) 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
};

const groupStyle: React.CSSProperties = {
  margin: 'var(--space-2) 0',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 'var(--space-1)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-1) 0',
  fontSize: 'var(--text-base)',
};

const statsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-4)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  padding: 'var(--space-1) 0',
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
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  minWidth: 55,
  textAlign: 'right',
};

const sourceListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBottom: 'var(--space-1)',
};

const sourceItemStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '2px solid var(--border-muted)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 'var(--space-1)',
  minWidth: 100,
  maxWidth: 120,
  transition: 'var(--transition-fast)',
};

const actionBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};

const refreshBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-muted)',
  color: 'var(--text-muted)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  transition: 'var(--transition-fast)',
};

const smallBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  whiteSpace: 'nowrap',
  transition: 'var(--transition-fast)',
};

const saveBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const textInputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--text-xs)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
};

const consentBoxStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  marginBottom: 'var(--space-3)',
};

const consentBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-3) 0',
};

function toggleStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? 'var(--color-primary)' : 'var(--bg-elevated)',
    color: on ? 'var(--color-primary-on)' : 'var(--text-primary)',
    border: '1px solid ' + (on ? 'var(--color-primary)' : 'var(--border-default)'),
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-2)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)' as any,
    minWidth: 40,
    transition: 'var(--transition-fast)',
  };
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-primary)' : 'var(--bg-surface)',
    color: active ? 'var(--color-primary-on)' : 'var(--text-muted)',
    border: '1px solid ' + (active ? 'var(--color-primary)' : 'var(--border-muted)'),
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-1) var(--space-2)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: active ? 'var(--font-semibold)' as any : 'var(--font-normal)' as any,
    transition: 'var(--transition-fast)',
  };
}
