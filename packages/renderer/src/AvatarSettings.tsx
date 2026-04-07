import { useState, useEffect, useCallback, useRef } from 'react';
import { AvatarScene } from '@aris/avatar';

interface AvatarInfo {
  filename: string;
  name: string;
  isDefault: boolean;
}

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

export function AvatarSettings() {
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSceneRef = useRef<AvatarScene | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSuccess, setPreviewSuccess] = useState(false);

  // Initialize / tear down preview scene
  useEffect(() => {
    return () => {
      previewSceneRef.current?.dispose();
      previewSceneRef.current = null;
    };
  }, []);

  const handlePreview = useCallback(async (filename: string) => {
    setPreviewAvatar(filename);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewSuccess(false);

    // Wait a tick for the canvas to mount
    await new Promise((r) => setTimeout(r, 50));

    const canvas = previewCanvasRef.current;
    if (!canvas) {
      setPreviewError('Preview canvas not available');
      setPreviewLoading(false);
      return;
    }

    // Dispose previous scene
    previewSceneRef.current?.dispose();
    previewSceneRef.current = null;

    try {
      const scene = new AvatarScene(canvas);
      previewSceneRef.current = scene;

      const avatarUrl = `avatar://${filename}`;
      await scene.loadVRM(avatarUrl);
      scene.start();

      // Force a resize to match the canvas container
      scene.resize(canvas.clientWidth, canvas.clientHeight);

      setPreviewSuccess(true);
    } catch (e) {
      setPreviewError(
        `Failed to load VRM: ${e instanceof Error ? e.message : String(e)}`,
      );
      // Clean up the broken scene
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
  }, []);

  const handleDelete = async (filename: string) => {
    setError(null);
    setStatus(null);
    try {
      await window.aris.invoke('avatar:delete', filename);
      setStatus(`Deleted ${filename}`);
      // If we were previewing this avatar, close the preview
      if (previewAvatar === filename) {
        handleClosePreview();
      }
      await loadAvatars();
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : e}`);
    }
  };

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
      // Browser fallback: open a native file picker via hidden input
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

    // In browser mode we can't write to the filesystem directly.
    // Show an informative message with the file names so the user knows what to do.
    const names = Array.from(files).map((f) => f.name);
    setError(
      `Browser mode cannot copy files to disk. Please run the Electron desktop app, ` +
      `or manually place these files in the avatars folder: ${names.join(', ')}`,
    );
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    setError(null);
    setStatus(null);

    if (!isElectron) {
      setError('Open Folder requires the Electron desktop app. Run "pnpm dev" and use the Electron window.');
      return;
    }

    try {
      const dir = (await window.aris.invoke('avatar:open-folder')) as string | undefined;
      if (dir) {
        setStatus(`Opened: ${dir}`);
      }
    } catch (e) {
      setError(`Could not open folder: ${e instanceof Error ? e.message : e}`);
    }
  };

  const currentDefault = avatars.find((a) => a.isDefault);

  if (loading) {
    return <div style={sectionStyle}><p style={hintStyle}>Loading avatars...</p></div>;
  }

  const feedback = (
    <>
      {error && <p style={errorStyle}>{error}</p>}
      {status && <p style={statusStyle}>{status}</p>}
      {/* Hidden file input for browser-mode fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".vrm"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </>
  );

  if (avatars.length === 0) {
    return (
      <div style={sectionStyle}>
        <h3 style={headingStyle}>Avatars</h3>
        <p style={hintStyle}>
          No .vrm files found. Import avatar models or open the avatars folder.
        </p>
        <div style={buttonRowStyle}>
          <button onClick={handleImport} style={actionBtnStyle}>Import .vrm</button>
          <button onClick={handleOpenFolder} style={secondaryBtnStyle}>Open Folder</button>
        </div>
        {feedback}
      </div>
    );
  }

  const previewPanel = previewAvatar && (
    <div style={previewContainerStyle}>
      <div style={previewHeaderStyle}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' as any }}>
          Preview: {avatars.find((a) => a.filename === previewAvatar)?.name ?? previewAvatar}
        </span>
        <button onClick={handleClosePreview} style={closeBtnStyle}>Close</button>
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
            <span style={{ color: 'var(--color-success)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' as any }}>Model OK</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={sectionStyle}>
      <h3 style={headingStyle}>Avatars</h3>
      <p style={hintStyle}>
        Select a default avatar model. The active avatar will load on startup.
      </p>
      <div style={buttonRowStyle}>
        <button onClick={handleImport} style={actionBtnStyle}>Import .vrm</button>
        <button onClick={handleOpenFolder} style={secondaryBtnStyle}>Open Folder</button>
      </div>
      {feedback}

      {previewPanel}

      {currentDefault && (
        <div style={currentStyle}>
          Current: <strong>{currentDefault.name}</strong>
        </div>
      )}

      <div style={listStyle}>
        {avatars.map((avatar) => (
          <div key={avatar.filename} style={avatarRowStyle}>
            <div style={avatarInfoStyle}>
              <span style={avatarNameStyle}>{avatar.name}</span>
              <span style={hintStyle}>{avatar.filename}</span>
            </div>
            <div style={avatarActionsStyle}>
              <button
                onClick={() => handlePreview(avatar.filename)}
                style={previewBtnStyle}
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
                    style={selectBtnStyle}
                  >
                    {saving ? '...' : 'Set Default'}
                  </button>
                  <button
                    onClick={() => handleDelete(avatar.filename)}
                    style={deleteBtnStyle}
                  >
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

const sectionStyle: React.CSSProperties = {
  padding: 'var(--space-2) 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
};

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
  background: 'var(--color-error-bg)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  marginTop: 'var(--space-2)',
};

const statusStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-success)',
  marginTop: 'var(--space-2)',
};

const currentStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  marginBottom: 'var(--space-3)',
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
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-default)',
};

const avatarInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const avatarNameStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)' as any,
};

const activeBadgeStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-success)',
  background: 'var(--color-success-bg)',
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 'var(--font-semibold)' as any,
};

const selectBtnStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-3)',
};

const actionBtnStyle: React.CSSProperties = {
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
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};

const avatarActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  alignItems: 'center',
};

const previewBtnStyle: React.CSSProperties = {
  background: 'var(--bg-interactive)',
  color: 'var(--color-info)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
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
  padding: 'var(--space-1) var(--space-3)',
  background: 'var(--bg-surface)',
  borderBottom: '1px solid var(--border-subtle)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
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
  borderRadius: 'var(--radius-sm)',
};
