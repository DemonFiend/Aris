import { useState, useEffect, useCallback, useRef } from 'react';
import { AvatarScene } from '@aris/avatar';

interface AvatarInfo {
  filename: string;
  name: string;
  isDefault: boolean;
}

interface Capabilities {
  facialExpressions: boolean;
  lipSync: boolean;
  gazeTracking: boolean;
}

const HUMANOID_OVERRIDE_PREFIX = 'avatar-humanoid-override-';
const isElectron = navigator.userAgent.toLowerCase().includes('electron');

export function AvatarSettings() {
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Per-avatar humanoid overrides: true = forced humanoid, absent = auto
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSceneRef = useRef<AvatarScene | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [detectedHumanoid, setDetectedHumanoid] = useState<boolean | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    let timeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        previewSceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight);
      }, 150);
    });
    observer.observe(canvas);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
      previewSceneRef.current?.dispose();
      previewSceneRef.current = null;
    };
  }, [previewAvatar]);

  const loadAvatars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = (await window.aris.invoke('avatar:list-available')) as AvatarInfo[] | undefined;
      setAvatars(list ?? []);
    } catch (e) {
      setError(`Failed to load avatars: ${e instanceof Error ? e.message : e}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAvatars();
  }, [loadAvatars]);

  // Load stored humanoid overrides after avatar list is available
  useEffect(() => {
    if (avatars.length === 0) return;
    (async () => {
      const result: Record<string, boolean> = {};
      for (const avatar of avatars) {
        try {
          const val = (await window.aris.invoke('settings:get', `${HUMANOID_OVERRIDE_PREFIX}${avatar.filename}`)) as string | undefined;
          if (val === '1') result[avatar.filename] = true;
        } catch {
          // ignore missing keys
        }
      }
      setOverrides(result);
    })();
  }, [avatars]);

  const handlePreview = useCallback(async (filename: string) => {
    setPreviewAvatar(filename);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewSuccess(false);
    setDetectedHumanoid(null);
    setCapabilities(null);

    await new Promise((r) => setTimeout(r, 50));

    const canvas = previewCanvasRef.current;
    if (!canvas) {
      setPreviewError('Preview canvas not available');
      setPreviewLoading(false);
      return;
    }

    previewSceneRef.current?.dispose();
    previewSceneRef.current = null;

    try {
      const scene = new AvatarScene(canvas);
      previewSceneRef.current = scene;
      const avatarUrl = `avatar://${filename}`;
      await scene.loadVRM(avatarUrl);
      scene.resize(canvas.clientWidth, canvas.clientHeight);
      scene.start();

      setDetectedHumanoid(scene.isHumanoid);
      setCapabilities(scene.getCapabilities());
      setPreviewSuccess(true);
    } catch (e) {
      setPreviewError(`Failed to load VRM: ${e instanceof Error ? e.message : String(e)}`);
      previewSceneRef.current?.dispose();
      previewSceneRef.current = null;
    }
    setPreviewLoading(false);
  }, []);

  const handleClosePreview = useCallback(() => {
    previewSceneRef.current?.dispose();
    previewSceneRef.current = null;
    setPreviewAvatar(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewSuccess(false);
    setDetectedHumanoid(null);
    setCapabilities(null);
  }, []);

  const handleToggleHumanoidOverride = async (filename: string, checked: boolean) => {
    try {
      if (checked) {
        await window.aris.invoke('settings:set', `${HUMANOID_OVERRIDE_PREFIX}${filename}`, '1');
        setOverrides((prev) => ({ ...prev, [filename]: true }));
      } else {
        await window.aris.invoke('settings:delete', `${HUMANOID_OVERRIDE_PREFIX}${filename}`);
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[filename];
          return next;
        });
      }
    } catch (e) {
      setError(`Failed to save setting: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleDelete = async (filename: string) => {
    setError(null);
    setStatus(null);
    try {
      await window.aris.invoke('avatar:delete', filename);
      // Clean up stored override
      try { await window.aris.invoke('settings:delete', `${HUMANOID_OVERRIDE_PREFIX}${filename}`); } catch { /* ignore */ }
      setStatus(`Deleted ${filename}`);
      if (previewAvatar === filename) handleClosePreview();
      await loadAvatars();
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleSetDefault = async (filename: string) => {
    setSaving(true);
    setError(null);
    try {
      await window.aris.invoke('avatar:set-default', filename);
      await loadAvatars();
    } catch (e) {
      setError(`Failed to set default avatar: ${e instanceof Error ? e.message : e}`);
    }
    setSaving(false);
  };

  const handleImport = async () => {
    setError(null);
    setStatus(null);
    if (!isElectron) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const imported = (await window.aris.invoke('avatar:import')) as string[] | undefined;
      if (imported && imported.length > 0) {
        setStatus(`Imported ${imported.length} avatar${imported.length > 1 ? 's' : ''}.`);
        await loadAvatars();
      }
    } catch (e) {
      setError(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => f.name);
    setError(
      `Browser mode cannot copy files to disk. Please run the Electron desktop app, ` +
      `or manually place these files in the avatars folder: ${names.join(', ')}`,
    );
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    setError(null);
    setStatus(null);
    if (!isElectron) {
      setError('Open Folder requires the Electron desktop app.');
      return;
    }
    try {
      const dir = (await window.aris.invoke('avatar:open-folder')) as string | undefined;
      if (dir) setStatus(`Opened: ${dir}`);
    } catch (e) {
      setError(`Could not open folder: ${e instanceof Error ? e.message : e}`);
    }
  };

  const currentDefault = avatars.find((a) => a.isDefault);

  if (loading) {
    return <div style={containerStyle}><p style={hintStyle}>Loading avatars...</p></div>;
  }

  const feedback = (
    <>
      {error && <div style={errorBannerStyle}>{error}</div>}
      {status && <div style={successBannerStyle}>{status}</div>}
      <input ref={fileInputRef} type="file" accept=".vrm" multiple style={{ display: 'none' }} onChange={handleFileInputChange} />
    </>
  );

  if (avatars.length === 0) {
    return (
      <div style={containerStyle}>
        <h3 style={headingStyle}>Avatars</h3>
        <p style={hintStyle}>No .vrm files found. Import avatar models or open the avatars folder.</p>
        <div style={btnRowStyle}>
          <button onClick={handleImport} style={primaryBtnStyle}>Import .vrm</button>
          <button onClick={handleOpenFolder} style={secondaryBtnStyle}>Open Folder</button>
        </div>
        {feedback}
      </div>
    );
  }

  // Compute effective humanoid for the previewed avatar
  const effectiveHumanoid =
    previewAvatar !== null && overrides[previewAvatar] === true
      ? true
      : detectedHumanoid ?? false;

  const previewPanel = previewAvatar && (
    <div style={previewContainerStyle}>
      <div style={previewHeaderStyle}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' as any }}>
          Preview: {avatars.find((a) => a.filename === previewAvatar)?.name ?? previewAvatar}
        </span>
        <button onClick={handleClosePreview} style={secondaryBtnSmStyle}>Close</button>
      </div>
      <div style={previewCanvasWrapStyle}>
        <canvas ref={previewCanvasRef} style={previewCanvasStyle} />
        {previewLoading && (
          <div style={previewOverlayStyle}>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading model...</span>
          </div>
        )}
        {previewError && (
          <div style={previewOverlayStyle}>
            <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-2)' }}>
              {previewError}
            </span>
          </div>
        )}
        {previewSuccess && !previewLoading && (
          <div style={previewBadgeStyle}>
            <span style={{ color: 'var(--color-success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' as any }}>
              Model OK
            </span>
          </div>
        )}
      </div>

      {/* Model type info — only shown after successful load */}
      {previewSuccess && !previewLoading && detectedHumanoid !== null && (
        <div style={modelInfoPanelStyle}>
          {/* Detected type badge */}
          <div style={modelTypRowStyle}>
            <span style={labelStyle}>Model type</span>
            <span style={effectiveHumanoid ? humanoidBadgeStyle : nonHumanoidBadgeStyle}>
              {effectiveHumanoid ? 'Humanoid' : 'Non-Humanoid'}
            </span>
            {overrides[previewAvatar] === true && (
              <span style={overridePillStyle}>override</span>
            )}
          </div>

          {/* Override toggle */}
          <label style={overrideRowStyle}>
            <input
              type="checkbox"
              checked={overrides[previewAvatar] === true}
              onChange={(e) => handleToggleHumanoidOverride(previewAvatar, e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Treat as humanoid
              {detectedHumanoid === false && overrides[previewAvatar] !== true && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  (auto-detected: non-humanoid)
                </span>
              )}
              {detectedHumanoid === true && overrides[previewAvatar] !== true && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                  (auto-detected: humanoid)
                </span>
              )}
            </span>
          </label>

          {/* Capability indicators */}
          {capabilities && (
            <div style={capabilitiesSectionStyle}>
              <span style={labelStyle}>Capabilities</span>
              <div style={capsGridStyle}>
                <CapabilityBadge label="Humanoid animations" available={effectiveHumanoid} />
                <CapabilityBadge label="Facial expressions" available={capabilities.facialExpressions} />
                <CapabilityBadge label="Lip sync" available={capabilities.lipSync} />
                <CapabilityBadge label="Gaze tracking" available={capabilities.gazeTracking} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Avatars</h3>
      <p style={hintStyle}>Select a default avatar model. The active avatar will load on startup.</p>

      <div style={btnRowStyle}>
        <button onClick={handleImport} style={primaryBtnStyle}>Import .vrm</button>
        <button onClick={handleOpenFolder} style={secondaryBtnStyle}>Open Folder</button>
      </div>

      {feedback}
      {previewPanel}

      {currentDefault && (
        <div style={currentBadgeStyle}>
          Active: <strong>{currentDefault.name}</strong>
        </div>
      )}

      <div style={listStyle}>
        {avatars.map((avatar) => (
          <div key={avatar.filename} style={avatarRowStyle}>
            <div style={avatarInfoStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span style={avatarNameStyle}>{avatar.name}</span>
                {overrides[avatar.filename] === true && (
                  <span style={humanoidRowBadgeStyle}>Humanoid</span>
                )}
              </div>
              <span style={fileHintStyle}>{avatar.filename}</span>
            </div>
            <div style={avatarActionsStyle}>
              <button
                onClick={() => handlePreview(avatar.filename)}
                style={chipBtnStyle}
                disabled={previewLoading}
              >
                Preview
              </button>
              {avatar.isDefault ? (
                <span style={activeBadgeStyle}>Active</span>
              ) : (
                <>
                  <button
                    onClick={() => handleSetDefault(avatar.filename)}
                    disabled={saving}
                    style={chipBtnStyle}
                  >
                    {saving ? '...' : 'Set Default'}
                  </button>
                  <button onClick={() => handleDelete(avatar.filename)} style={dangerChipStyle}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapabilityBadge({ label, available }: { label: string; available: boolean }) {
  return (
    <div style={capBadgeWrapStyle}>
      <span style={available ? capCheckStyle : capCrossStyle}>{available ? '✓' : '✗'}</span>
      <span style={capLabelStyle}>{label}</span>
    </div>
  );
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-1)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: '0 0 var(--space-1)',
  lineHeight: 'var(--leading-normal)',
};

const btnRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-3)',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
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

const secondaryBtnSmStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
};

const errorBannerStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
  background: 'var(--color-error-bg)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  marginTop: 'var(--space-2)',
};

const successBannerStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-success)',
  background: 'var(--color-success-bg)',
  border: '1px solid rgba(0,230,118,0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  marginTop: 'var(--space-2)',
};

const currentBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  marginTop: 'var(--space-3)',
  marginBottom: 'var(--space-1)',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-2)',
};

const avatarRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-subtle)',
};

const avatarInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const avatarNameStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)' as any,
};

const fileHintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const avatarActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  alignItems: 'center',
  flexShrink: 0,
};

const chipBtnStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-secondary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
};

const dangerChipStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
};

const activeBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-success)',
  background: 'var(--color-success-bg)',
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-full)',
  fontWeight: 'var(--font-semibold)' as any,
};

const previewContainerStyle: React.CSSProperties = {
  marginTop: 'var(--space-3)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  background: 'var(--bg-base)',
};

const previewHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border-subtle)',
};

const previewCanvasWrapStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 220,
  background: 'var(--bg-canvas)',
};

const previewCanvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

const previewOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(6, 13, 23, 0.85)',
};

const previewBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  right: 8,
  background: 'var(--color-success-bg)',
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-full)',
};

const modelInfoPanelStyle: React.CSSProperties = {
  padding: 'var(--space-3)',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const modelTypRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  minWidth: 80,
};

const humanoidBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as any,
  color: '#7dd3fc',
  background: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.3)',
  padding: '1px var(--space-2)',
  borderRadius: 'var(--radius-full)',
};

const nonHumanoidBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as any,
  color: '#c4b5fd',
  background: 'rgba(167, 139, 250, 0.12)',
  border: '1px solid rgba(167, 139, 250, 0.3)',
  padding: '1px var(--space-2)',
  borderRadius: 'var(--radius-full)',
};

const overridePillStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  padding: '1px 6px',
  borderRadius: 'var(--radius-full)',
};

const overrideRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  cursor: 'pointer',
};

const capabilitiesSectionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
};

const capsGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-1)',
};

const capBadgeWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-full)',
  padding: '2px var(--space-2)',
};

const capCheckStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--color-success)',
  fontWeight: 'bold',
};

const capCrossStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--color-error)',
  fontWeight: 'bold',
};

const capLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
};

const humanoidRowBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#7dd3fc',
  background: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.2)',
  padding: '0 5px',
  borderRadius: 'var(--radius-full)',
  lineHeight: '16px',
};
