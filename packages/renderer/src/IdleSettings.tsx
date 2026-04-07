import { useState, useEffect, useCallback } from 'react';
import type { CompanionConfig, CompanionIdleBehavior } from '@aris/shared';

export function IdleSettings() {
  const [idle, setIdle] = useState<CompanionIdleBehavior | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const config = (await window.aris.invoke('companion:get-config')) as CompanionConfig | null;
    if (config?.idle) {
      // Back-compat: fill in new fields with defaults if missing
      setIdle({
        enabled: true,
        mode: 'beginner',
        ...config.idle,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<CompanionIdleBehavior>) => {
      if (!idle) return;
      setSaving(true);
      const updated = { ...idle, ...patch };
      setIdle(updated);
      const config = (await window.aris.invoke('companion:get-config')) as CompanionConfig;
      await window.aris.invoke('companion:set-config', { ...config, idle: updated });
      setSaving(false);
    },
    [idle],
  );

  const resetDefaults = useCallback(async () => {
    const defaults: CompanionIdleBehavior = {
      enabled: true,
      mode: 'advanced',
      breathingIntensity: 1.0,
      swayIntensity: 1.0,
      blinkFrequency: 4,
      expressionSensitivity: 0.5,
      bodyIntensity: 1.0,
      variationFrequency: 0.5,
    };
    await save(defaults);
  }, [save]);

  if (!idle) return null;

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Idle Animations</h3>

      {/* Master toggle */}
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>Idle Animations</div>
          <p style={descStyle}>Subtle breathing, sway, blinks, and body movements</p>
        </div>
        <ToggleButton on={idle.enabled} onClick={() => save({ enabled: !idle.enabled })} />
      </div>

      {idle.enabled && (
        <>
          {/* Mode toggle */}
          <div style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={labelStyle}>Mode</div>
              <p style={descStyle}>
                {idle.mode === 'beginner'
                  ? 'Simple on/off with curated preset'
                  : 'Fine-tune individual animation parameters'}
              </p>
            </div>
            <div style={modeToggleStyle}>
              <button
                style={idle.mode === 'beginner' ? modeActiveBtnStyle : modeBtnStyle}
                onClick={() => save({ mode: 'beginner' })}
              >
                Simple
              </button>
              <button
                style={idle.mode === 'advanced' ? modeActiveBtnStyle : modeBtnStyle}
                onClick={() => save({ mode: 'advanced' })}
              >
                Advanced
              </button>
            </div>
          </div>

          {idle.mode === 'advanced' && (
            <>
              <div style={dividerStyle} />

              {/* Head & Face */}
              <h4 style={subheadingStyle}>Head & Face</h4>
              <SliderRow
                label="Breathing"
                value={idle.breathingIntensity}
                onChange={(v) => save({ breathingIntensity: v })}
              />
              <SliderRow
                label="Head Sway"
                value={idle.swayIntensity}
                onChange={(v) => save({ swayIntensity: v })}
              />
              <SliderRow
                label="Blink Speed"
                desc="Lower = more frequent"
                min={2}
                max={10}
                step={0.5}
                value={idle.blinkFrequency}
                onChange={(v) => save({ blinkFrequency: v })}
              />

              <div style={dividerStyle} />

              {/* Body */}
              <h4 style={subheadingStyle}>Body</h4>
              <SliderRow
                label="Body Motion"
                desc="Hip sway, torso rock, arm drift, shoulders"
                value={idle.bodyIntensity}
                onChange={(v) => save({ bodyIntensity: v })}
              />

              <div style={dividerStyle} />

              {/* Variations */}
              <h4 style={subheadingStyle}>Variation Events</h4>
              <SliderRow
                label="Frequency"
                desc="Stretch, glance, and settle events"
                value={idle.variationFrequency}
                onChange={(v) => save({ variationFrequency: v })}
              />

              <div style={dividerStyle} />

              <button onClick={resetDefaults} style={resetBtnStyle} disabled={saving}>
                Reset to Defaults
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SliderRow({
  label,
  desc,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
}: {
  label: string;
  desc?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const pct = max <= 1 ? `${Math.round(value * 100)}%` : value.toFixed(1);
  return (
    <div style={sliderRowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={labelStyle}>{label}</span>
        <span style={valueStyle}>{pct}</span>
      </div>
      {desc && <p style={descStyle}>{desc}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={sliderStyle}
      />
    </div>
  );
}

function ToggleButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={toggleBtnStyle}>
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
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const subheadingStyle: React.CSSProperties = {
  margin: 'var(--space-2) 0 var(--space-1)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-3) 0',
  gap: 'var(--space-4)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)' as any,
  color: 'var(--text-primary)',
};

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 0',
  lineHeight: 'var(--leading-normal)',
};

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

const sliderRowStyle: React.CSSProperties = {
  padding: 'var(--space-2) 0',
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 'var(--space-1)',
  accentColor: 'var(--color-primary)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 'var(--space-2) 0',
};

const modeToggleStyle: React.CSSProperties = {
  display: 'flex',
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  border: '1px solid var(--border-default)',
};

const modeBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-muted)',
  border: 'none',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
};

const modeActiveBtnStyle: React.CSSProperties = {
  ...modeBtnStyle,
  background: 'var(--color-primary)',
  color: '#fff',
  fontWeight: 'var(--font-semibold)' as any,
};

const resetBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  width: '100%',
  marginTop: 'var(--space-1)',
};

const toggleBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
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
