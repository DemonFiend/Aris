import type { CameraMode, CameraViewerConfig } from '@aris/shared';

type Preset = 'companion' | 'streamer';

interface Props {
  config: CameraViewerConfig;
  onConfigChange: (partial: Partial<CameraViewerConfig>) => void;
  onResetPosition: () => void;
  onClose: () => void;
}

const FRAMING_OPTIONS: { mode: CameraMode; label: string }[] = [
  { mode: 'headshot', label: 'Headshot' },
  { mode: 'upper_torso', label: 'Upper Torso' },
  { mode: 'fullbody', label: 'Full Body' },
];

const COMPANION_PRESET: Partial<CameraViewerConfig> = {
  mode: 'upper_torso',
  transparentBg: false,
  alwaysOnTop: true,
  clickThrough: false,
  locked: false,
  opacity: 1.0,
};

const STREAMER_PRESET: Partial<CameraViewerConfig> = {
  mode: 'headshot',
  transparentBg: true,
  alwaysOnTop: true,
  clickThrough: true,
  locked: true,
  opacity: 1.0,
};

export function CameraViewerSettingsPanel({ config, onConfigChange, onResetPosition, onClose }: Props) {
  const handlePreset = (preset: Preset) => {
    onConfigChange(preset === 'companion' ? COMPANION_PRESET : STREAMER_PRESET);
  };

  const handleClickThrough = (enabled: boolean) => {
    if (enabled) {
      onConfigChange({ clickThrough: true, locked: true });
    } else {
      onConfigChange({ clickThrough: false });
    }
  };

  const opacityPct = Math.round(config.opacity * 100);

  return (
    <div style={panelStyle} role="dialog" aria-label="Camera viewer settings">
      {/* Preset */}
      <div style={sectionStyle}>
        <label style={sectionLabelStyle}>Preset</label>
        <select
          style={selectStyle}
          value=""
          onChange={(e) => { if (e.target.value) handlePreset(e.target.value as Preset); }}
          aria-label="Apply preset"
        >
          <option value="" disabled>Apply preset…</option>
          <option value="companion">Companion</option>
          <option value="streamer">Streamer</option>
        </select>
      </div>

      <div style={dividerStyle} />

      {/* Framing */}
      <div style={sectionStyle}>
        <label style={sectionLabelStyle}>Framing</label>
        <div role="radiogroup" aria-label="Camera framing" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FRAMING_OPTIONS.map((opt) => (
            <label key={opt.mode} style={radioRowStyle}>
              <input
                type="radio"
                name="framing"
                value={opt.mode}
                checked={config.mode === opt.mode}
                onChange={() => onConfigChange({ mode: opt.mode })}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Toggles */}
      <div style={sectionStyle}>
        <ToggleRow
          label="Always on top"
          checked={config.alwaysOnTop}
          onChange={(v) => onConfigChange({ alwaysOnTop: v })}
        />
        <ToggleRow
          label="Transparent background"
          checked={config.transparentBg}
          onChange={(v) => onConfigChange({ transparentBg: v })}
        />
        <ToggleRow
          label="Click-through"
          checked={config.clickThrough}
          onChange={handleClickThrough}
          hint={config.clickThrough ? 'Auto-enables Lock layout' : undefined}
        />
        <ToggleRow
          label="Lock layout"
          checked={config.locked}
          onChange={(v) => onConfigChange({ locked: v })}
        />
      </div>

      <div style={dividerStyle} />

      {/* Opacity slider */}
      <div style={sectionStyle}>
        <label style={sectionLabelStyle} htmlFor="viewer-opacity">
          Opacity — {opacityPct}%
        </label>
        <input
          id="viewer-opacity"
          type="range"
          min={40}
          max={100}
          step={5}
          value={opacityPct}
          onChange={(e) => onConfigChange({ opacity: Number(e.target.value) / 100 })}
          style={sliderStyle}
          aria-label="Window opacity"
          aria-valuemin={40}
          aria-valuemax={100}
          aria-valuenow={opacityPct}
        />
      </div>

      <div style={dividerStyle} />

      {/* Actions */}
      <div style={sectionStyle}>
        <button style={resetBtnStyle} onClick={onResetPosition} aria-label="Reset window position and size">
          Reset position &amp; size
        </button>
        <button style={closeBtnStyle} onClick={onClose} aria-label="Close settings">
          Done
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label style={toggleRowStyle}>
      <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
        {label}
        {hint && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: 4 }}>{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }}
        aria-label={label}
      />
    </label>
  );
}

/* ── Styles ── */

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 32,
  right: 6,
  width: 240,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-lg)',
  padding: '6px 0',
  zIndex: 200,
  userSelect: 'none',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '4px 12px',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--border-subtle)',
  margin: '4px 0',
};

const radioRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
};

const toggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  padding: '2px 0',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: '4px 6px',
  fontSize: 'var(--text-sm)',
  cursor: 'pointer',
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  accentColor: 'var(--color-primary)',
  cursor: 'pointer',
};

const resetBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 10px',
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  width: '100%',
  transition: 'var(--transition-fast)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  border: 'none',
  color: 'var(--color-primary-on)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 10px',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  cursor: 'pointer',
  width: '100%',
  boxShadow: 'var(--shadow-glow-sm)',
  transition: 'var(--transition-fast)',
};
