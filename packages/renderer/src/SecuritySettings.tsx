import { useState, useEffect, useCallback } from 'react';
import type { PasswordConfig } from '@aris/shared';

export function SecuritySettings() {
  const [config, setConfig] = useState<PasswordConfig | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [startupPassword, setStartupPassword] = useState('');
  const [confirmStartupPassword, setConfirmStartupPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingStartupPassword, setChangingStartupPassword] = useState(false);

  const loadConfig = useCallback(async () => {
    const cfg = (await window.aris.invoke('password:get-config')) as PasswordConfig;
    setConfig(cfg);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSetPassword = async () => {
    if (password.length < 4) {
      showMessage('Password must be at least 4 characters', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showMessage('Passwords do not match', 'error');
      return;
    }
    try {
      const cfg = (await window.aris.invoke('password:set-password', password)) as PasswordConfig;
      setConfig(cfg);
      setPassword('');
      setConfirmPassword('');
      setChangingPassword(false);
      showMessage('Password set successfully', 'success');
    } catch {
      showMessage('Failed to set password', 'error');
    }
  };

  const handleSetStartupPassword = async () => {
    if (startupPassword.length < 4) {
      showMessage('Password must be at least 4 characters', 'error');
      return;
    }
    if (startupPassword !== confirmStartupPassword) {
      showMessage('Passwords do not match', 'error');
      return;
    }
    try {
      const cfg = (await window.aris.invoke(
        'password:set-startup-password',
        startupPassword,
      )) as PasswordConfig;
      setConfig(cfg);
      setStartupPassword('');
      setConfirmStartupPassword('');
      setChangingStartupPassword(false);
      showMessage('Startup password set successfully', 'success');
    } catch {
      showMessage('Failed to set startup password', 'error');
    }
  };

  const handleToggle = async (key: keyof PasswordConfig, value: boolean) => {
    const cfg = (await window.aris.invoke('password:set-config', {
      [key]: value,
    })) as PasswordConfig;
    setConfig(cfg);
  };

  const handleRemovePassword = async () => {
    const cfg = (await window.aris.invoke('password:remove')) as PasswordConfig;
    setConfig(cfg);
    setChangingPassword(false);
    setChangingStartupPassword(false);
    showMessage('Password protection removed', 'success');
  };

  if (!config) return null;

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Password Lock</h3>
      <p style={descStyle}>
        Protect Aris with a local password. Passwords are securely hashed and never stored in
        plaintext.
      </p>

      {message && (
        <div
          style={{
            ...bannerStyle,
            background: message.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            borderColor: message.type === 'success' ? 'rgba(0,230,118,0.3)' : 'rgba(255,83,112,0.3)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Master toggle */}
      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Password protection</span>
          <span style={hintStyle}>
            {config.enabled && config.hasPassword
              ? 'Password is set and active'
              : 'Off \u2014 no password required'}
          </span>
        </div>
        {config.enabled && config.hasPassword ? (
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <button onClick={() => setChangingPassword(true)} style={secondaryBtnStyle}>Change</button>
            <button onClick={handleRemovePassword} style={dangerBtnStyle}>Remove</button>
          </div>
        ) : (
          <button onClick={() => setChangingPassword(true)} style={primaryBtnStyle}>Set Password</button>
        )}
      </div>

      {/* Set/Change password form */}
      {changingPassword && (
        <div style={formBoxStyle}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={config.hasPassword ? 'New password' : 'Password'}
            style={inputStyle}
            autoFocus
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={handleSetPassword}
              disabled={!password || !confirmPassword}
              style={primaryBtnStyle}
            >
              {config.hasPassword ? 'Update Password' : 'Set Password'}
            </button>
            <button
              onClick={() => { setChangingPassword(false); setPassword(''); setConfirmPassword(''); }}
              style={secondaryBtnStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toggles — only visible when password is set */}
      {config.enabled && config.hasPassword && (
        <>
          <div style={dividerStyle} />

          <div style={rowStyle}>
            <div style={rowLabelStyle}>
              <span style={labelStyle}>Require password to enable</span>
              <span style={hintStyle}>Ask for password before Aris can be activated</span>
            </div>
            <ToggleSwitch on={config.onEnable} onClick={() => handleToggle('onEnable', !config.onEnable)} />
          </div>

          <div style={rowStyle}>
            <div style={rowLabelStyle}>
              <span style={labelStyle}>Require password on startup</span>
              <span style={hintStyle}>Lock the app on launch. Failed attempts will close Aris.</span>
            </div>
            <ToggleSwitch on={config.onStart} onClick={() => handleToggle('onStart', !config.onStart)} />
          </div>

          {config.onEnable && config.onStart && (
            <>
              <div style={rowStyle}>
                <div style={rowLabelStyle}>
                  <span style={labelStyle}>Use same password for both</span>
                  <span style={hintStyle}>Single password for enable and startup</span>
                </div>
                <ToggleSwitch on={config.useSamePassword} onClick={() => handleToggle('useSamePassword', !config.useSamePassword)} />
              </div>

              {!config.useSamePassword && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <div style={rowStyle}>
                    <div style={rowLabelStyle}>
                      <span style={labelStyle}>Startup password</span>
                      <span style={hintStyle}>
                        {config.hasStartupPassword
                          ? 'A separate startup password is set'
                          : 'No separate startup password \u2014 set one below'}
                      </span>
                    </div>
                    <button onClick={() => setChangingStartupPassword(true)} style={secondaryBtnStyle}>
                      {config.hasStartupPassword ? 'Change' : 'Set'}
                    </button>
                  </div>

                  {changingStartupPassword && (
                    <div style={formBoxStyle}>
                      <input
                        type="password"
                        value={startupPassword}
                        onChange={(e) => setStartupPassword(e.target.value)}
                        placeholder="Startup password"
                        style={inputStyle}
                        autoFocus
                      />
                      <input
                        type="password"
                        value={confirmStartupPassword}
                        onChange={(e) => setConfirmStartupPassword(e.target.value)}
                        placeholder="Confirm startup password"
                        style={inputStyle}
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          onClick={handleSetStartupPassword}
                          disabled={!startupPassword || !confirmStartupPassword}
                          style={primaryBtnStyle}
                        >
                          {config.hasStartupPassword ? 'Update' : 'Set Startup Password'}
                        </button>
                        <button
                          onClick={() => { setChangingStartupPassword(false); setStartupPassword(''); setConfirmStartupPassword(''); }}
                          style={secondaryBtnStyle}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
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

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: '0 0 var(--space-3)',
  lineHeight: 'var(--leading-normal)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-3) 0',
  gap: 'var(--space-4)',
};

const rowLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)' as any,
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 0,
};

const bannerStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-3)',
  border: '1px solid',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
};

const formBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-lg)',
  marginTop: 'var(--space-2)',
  border: '1px solid var(--border-subtle)',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
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
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

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
