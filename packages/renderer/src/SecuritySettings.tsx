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
    <div style={sectionStyle}>
      <h3 style={headingStyle}>Password Lock</h3>
      <p style={hintStyle}>
        Protect Aris with a local password. Passwords are securely hashed and never stored in
        plaintext.
      </p>

      {message && (
        <div
          style={{
            ...messageBannerStyle,
            background:
              message.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
            color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            borderColor:
              message.type === 'success'
                ? 'rgba(0,230,118,0.3)'
                : 'rgba(255,83,112,0.3)',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Master toggle */}
      <div style={rowStyle}>
        <div>
          <span>Password protection</span>
          <p style={hintStyle}>
            {config.enabled && config.hasPassword
              ? 'Password is set and active'
              : 'Off — no password required'}
          </p>
        </div>
        {config.enabled && config.hasPassword ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button onClick={() => setChangingPassword(true)} style={actionBtnStyle}>
              Change
            </button>
            <button onClick={handleRemovePassword} style={dangerBtnStyle}>
              Remove
            </button>
          </div>
        ) : (
          <button onClick={() => setChangingPassword(true)} style={actionBtnStyle}>
            Set Password
          </button>
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
              onClick={() => {
                setChangingPassword(false);
                setPassword('');
                setConfirmPassword('');
              }}
              style={actionBtnStyle}
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

          {/* Password on Enable */}
          <div style={rowStyle}>
            <div>
              <span>Require password to enable</span>
              <p style={hintStyle}>Ask for password before Aris can be activated</p>
            </div>
            <button
              onClick={() => handleToggle('onEnable', !config.onEnable)}
              style={toggleBtnStyle(config.onEnable)}
            >
              {config.onEnable ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Password on Start */}
          <div style={rowStyle}>
            <div>
              <span>Require password on startup</span>
              <p style={hintStyle}>
                Lock the app on launch. Failed attempts will close Aris.
              </p>
            </div>
            <button
              onClick={() => handleToggle('onStart', !config.onStart)}
              style={toggleBtnStyle(config.onStart)}
            >
              {config.onStart ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Use same password — only show when both onEnable and onStart are on */}
          {config.onEnable && config.onStart && (
            <>
              <div style={rowStyle}>
                <div>
                  <span>Use same password for both</span>
                  <p style={hintStyle}>
                    Single password for enable and startup
                  </p>
                </div>
                <button
                  onClick={() => handleToggle('useSamePassword', !config.useSamePassword)}
                  style={toggleBtnStyle(config.useSamePassword)}
                >
                  {config.useSamePassword ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Separate startup password — only when useSamePassword is off */}
              {!config.useSamePassword && (
                <div style={{ marginTop: 'var(--space-2)' }}>
                  <div style={rowStyle}>
                    <div>
                      <span>Startup password</span>
                      <p style={hintStyle}>
                        {config.hasStartupPassword
                          ? 'A separate startup password is set'
                          : 'No separate startup password — set one below'}
                      </p>
                    </div>
                    <button
                      onClick={() => setChangingStartupPassword(true)}
                      style={actionBtnStyle}
                    >
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
                          onClick={() => {
                            setChangingStartupPassword(false);
                            setStartupPassword('');
                            setConfirmStartupPassword('');
                          }}
                          style={actionBtnStyle}
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

const sectionStyle: React.CSSProperties = {
  padding: 'var(--space-2) 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-1)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-2) 0',
  fontSize: 'var(--text-base)',
  gap: 'var(--space-4)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-3) 0',
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
};

const formBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-md)',
  marginTop: 'var(--space-2)',
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
  whiteSpace: 'nowrap',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const messageBannerStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-3)',
  border: '1px solid',
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
    minWidth: 40,
    transition: 'var(--transition-fast)',
  };
}
