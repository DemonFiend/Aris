import { useState, useEffect, useCallback, useRef } from 'react';

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
            {avatar.isDefault ? (
              <span style={activeBadgeStyle}>Active</span>
            ) : (
              <button
                onClick={() => handleSetDefault(avatar.filename)}
                disabled={saving}
                style={selectBtnStyle}
              >
                {saving ? '...' : 'Set Default'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: '0.5rem 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '1rem',
  fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  margin: '0.15rem 0 0',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#f87171',
  background: '#1c1111',
  border: '1px solid #7f1d1d',
  borderRadius: '4px',
  padding: '0.35rem 0.5rem',
  marginTop: '0.5rem',
};

const statusStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#4ade80',
  marginTop: '0.5rem',
};

const currentStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#aaa',
  marginBottom: '0.75rem',
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '0.5rem',
};

const avatarRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem 0.75rem',
  background: '#1a1a1a',
  borderRadius: '6px',
  border: '1px solid #333',
};

const avatarInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.15rem',
};

const avatarNameStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 500,
};

const activeBadgeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#4ade80',
  background: '#14532d',
  padding: '0.2rem 0.5rem',
  borderRadius: '4px',
  fontWeight: 600,
};

const selectBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '0.25rem 0.6rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: '0.75rem',
};

const actionBtnStyle: React.CSSProperties = {
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '6px',
  padding: '0.4rem 0.8rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};
