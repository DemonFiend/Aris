import { useEffect, useRef, useState } from 'react';
import type { CameraMode } from '@aris/shared';

interface Props {
  mode: CameraMode;
  isOpen: boolean;
  locked: boolean;
  onModeChange: (mode: CameraMode) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const FRAMING_OPTIONS: { mode: CameraMode; label: string; key: string }[] = [
  { mode: 'headshot', label: 'Headshot', key: '1' },
  { mode: 'upper_torso', label: 'Upper Torso', key: '2' },
  { mode: 'fullbody', label: 'Full Body', key: '3' },
];

export function CameraViewerChrome({ mode, locked, onModeChange, onOpenSettings, onClose }: Props) {
  const [visible, setVisible] = useState(true);
  const [radioFocusIdx, setRadioFocusIdx] = useState(
    FRAMING_OPTIONS.findIndex((o) => o.mode === mode),
  );
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Sync radio focus index when mode prop changes
  useEffect(() => {
    const idx = FRAMING_OPTIONS.findIndex((o) => o.mode === mode);
    if (idx >= 0) setRadioFocusIdx(idx);
  }, [mode]);

  const scheduleHide = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) { setVisible(false); return; }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), 1500);
  };

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  useEffect(() => {
    const root = rootRef.current?.parentElement;
    if (!root) return;
    const onEnter = () => { cancelHide(); setVisible(true); };
    const onLeave = () => { scheduleHide(); };
    root.addEventListener('mouseenter', onEnter);
    root.addEventListener('mouseleave', onLeave);
    return () => {
      root.removeEventListener('mouseenter', onEnter);
      root.removeEventListener('mouseleave', onLeave);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard 1/2/3 for framing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = FRAMING_OPTIONS.findIndex((o) => o.key === e.key);
      if (idx >= 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onModeChange(FRAMING_OPTIONS[idx].mode);
        setRadioFocusIdx(idx);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onModeChange]);

  if (locked) {
    return <LockedAffordance />;
  }

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={rootRef}
      style={{
        ...chromeBarStyle,
        opacity: visible ? 1 : 0,
        transition: prefersReducedMotion ? 'none' : (visible ? 'opacity 120ms ease' : 'opacity 200ms ease 1300ms'),
        pointerEvents: visible ? 'auto' : 'none',
      }}
      aria-label="Camera viewer controls"
    >
      {/* Drag region */}
      <div style={dragRegionStyle} />

      {/* Status dot + label */}
      <div style={labelGroupStyle}>
        <span style={statusDotStyle} aria-hidden="true" />
        <span style={labelStyle}>Aris Camera</span>
      </div>

      {/* Framing radiogroup */}
      <div
        role="radiogroup"
        aria-label="Camera framing"
        style={radioGroupStyle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = (radioFocusIdx - 1 + FRAMING_OPTIONS.length) % FRAMING_OPTIONS.length;
            setRadioFocusIdx(next);
            onModeChange(FRAMING_OPTIONS[next].mode);
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = (radioFocusIdx + 1) % FRAMING_OPTIONS.length;
            setRadioFocusIdx(next);
            onModeChange(FRAMING_OPTIONS[next].mode);
          }
        }}
      >
        {FRAMING_OPTIONS.map((opt, idx) => {
          const isActive = opt.mode === mode;
          return (
            <button
              key={opt.mode}
              role="radio"
              aria-checked={isActive}
              tabIndex={idx === radioFocusIdx ? 0 : -1}
              style={{
                ...pillStyle,
                ...(isActive ? activePillStyle : {}),
              }}
              title={`${opt.label} (${opt.key})`}
              aria-label={opt.label}
              onClick={() => { onModeChange(opt.mode); setRadioFocusIdx(idx); }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Settings + Close */}
      <div style={{ display: 'flex', gap: 4, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          style={iconBtnStyle}
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <GearIcon />
        </button>
        <button
          style={iconBtnStyle}
          title="Close camera viewer"
          aria-label="Close camera viewer"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function LockedAffordance() {
  return (
    <div style={lockedHintStyle} aria-label="Locked — press Esc to unlock">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ── Styles ── */

const chromeBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 6px',
  background: 'rgba(13, 27, 42, 0.9)',
  backdropFilter: 'blur(8px)',
  WebkitAppRegion: 'drag',
  zIndex: 100,
  userSelect: 'none',
};

const dragRegionStyle: React.CSSProperties = {
  flex: '0 0 4px',
  height: '100%',
  WebkitAppRegion: 'drag',
} as React.CSSProperties;

const labelGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  WebkitAppRegion: 'no-drag',
  flexShrink: 0,
} as React.CSSProperties;

const statusDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--color-success)',
  boxShadow: '0 0 5px rgba(0, 230, 118, 0.6)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const radioGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  flex: 1,
  justifyContent: 'center',
  WebkitAppRegion: 'no-drag',
} as React.CSSProperties;

const pillStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-full)',
  padding: '1px 8px',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
  lineHeight: 1.6,
  WebkitAppRegion: 'no-drag',
} as React.CSSProperties;

const activePillStyle: React.CSSProperties = {
  color: 'var(--color-primary)',
  background: 'var(--color-primary-subtle)',
  border: '1px solid var(--color-primary)',
  boxShadow: 'var(--shadow-glow-sm)',
};

const iconBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 0,
  WebkitAppRegion: 'no-drag',
  transition: 'var(--transition-fast)',
} as React.CSSProperties;

const lockedHintStyle: React.CSSProperties = {
  position: 'fixed',
  top: 4,
  right: 4,
  width: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'rgba(138, 173, 204, 0.3)',
  opacity: 0,
  transition: 'opacity 200ms ease',
  zIndex: 200,
  cursor: 'default',
  pointerEvents: 'none',
};
