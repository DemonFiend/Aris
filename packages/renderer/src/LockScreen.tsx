import { useState, useCallback } from 'react';
import { APP_NAME } from '@aris/shared';

interface LockScreenProps {
  purpose: 'startup' | 'enable';
  onUnlock: () => void;
  maxAttempts?: number;
}

export function LockScreen({ purpose, onUnlock, maxAttempts = 5 }: LockScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password || verifying) return;

      setVerifying(true);
      setError('');

      try {
        const valid = (await window.aris.invoke('password:verify', password, purpose)) as boolean;
        if (valid) {
          onUnlock();
        } else {
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          setPassword('');

          if (purpose === 'startup' && newAttempts >= maxAttempts) {
            setError('Too many failed attempts. Closing app...');
            setTimeout(() => window.aris.invoke('window:quit'), 1000);
          } else {
            const remaining = maxAttempts - newAttempts;
            setError(
              purpose === 'startup'
                ? `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
                : 'Incorrect password.',
            );
          }
        }
      } catch {
        setError('Verification failed.');
      } finally {
        setVerifying(false);
      }
    },
    [password, purpose, attempts, maxAttempts, onUnlock, verifying],
  );

  const title = purpose === 'startup' ? `${APP_NAME} is Locked` : 'Enter Password to Enable';

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={iconStyle}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 style={titleStyle}>{title}</h2>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          autoFocus
          style={inputStyle}
        />

        {error && <p style={errorStyle}>{error}</p>}

        <button type="submit" disabled={!password || verifying} style={submitStyle}>
          {verifying ? 'Verifying...' : 'Unlock'}
        </button>

        {purpose === 'startup' && (
          <button
            type="button"
            onClick={() => window.aris.invoke('window:quit')}
            style={quitBtnStyle}
          >
            Quit
          </button>
        )}
      </form>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--bg-canvas)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-8)',
  width: 320,
  maxWidth: '90vw',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  border: '1px solid var(--border-default)',
  boxShadow: 'var(--shadow-lg)',
};

const iconStyle: React.CSSProperties = {
  marginBottom: 'var(--space-1)',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-lg)',
  fontWeight: 'var(--font-semibold)' as any,
  textAlign: 'center',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-base)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
};

const errorStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-error)',
  fontSize: 'var(--text-sm)',
  textAlign: 'center',
};

const submitStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
};

const quitBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
  padding: 'var(--space-1)',
};
