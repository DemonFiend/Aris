import { useState, useEffect, useCallback } from 'react';

interface AvatarInfo {
  filename: string;
  name: string;
  isDefault: boolean;
}

export function AvatarSettings() {
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAvatars = useCallback(async () => {
    setLoading(true);
    const list = (await window.aris.invoke('avatar:list-available')) as AvatarInfo[] | undefined;
    setAvatars(list ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAvatars();
  }, [loadAvatars]);

  const handleSetDefault = async (filename: string) => {
    setSaving(true);
    await window.aris.invoke('avatar:set-default', filename);
    await loadAvatars();
    setSaving(false);
  };

  const handleImport = async () => {
    const imported = (await window.aris.invoke('avatar:import')) as string[] | undefined;
    if (imported && imported.length > 0) {
      await loadAvatars();
    }
  };

  const handleOpenFolder = async () => {
    await window.aris.invoke('avatar:open-folder');
  };

  const currentDefault = avatars.find((a) => a.isDefault);

  if (loading) {
    return <div style={sectionStyle}><p style={hintStyle}>Loading avatars...</p></div>;
  }

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
