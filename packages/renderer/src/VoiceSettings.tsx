import { useState, useEffect, useCallback } from 'react';
import type { VoiceConfig } from '@aris/shared';

export function VoiceSettings() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    const cfg = (await window.aris.invoke('voice:get-config')) as VoiceConfig;
    setConfig(cfg);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = async (patch: Partial<VoiceConfig>) => {
    setSaving(true);
    const updated = (await window.aris.invoke('voice:set-config', patch)) as VoiceConfig;
    setConfig(updated);
    setSaving(false);
  };

  if (!config) return <div style={{ color: 'var(--text-muted)', padding: 'var(--space-4)' }}>Loading...</div>;

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>Voice Settings</h3>

      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Language</span>
        </div>
        <select
          value={config.language}
          onChange={(e) => updateConfig({ language: e.target.value })}
          style={selectStyle}
        >
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
          <option value="es-ES">Spanish</option>
          <option value="fr-FR">French</option>
          <option value="de-DE">German</option>
          <option value="ja-JP">Japanese</option>
          <option value="ko-KR">Korean</option>
          <option value="zh-CN">Chinese (Simplified)</option>
        </select>
      </div>

      <div style={dividerStyle} />

      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Push-to-talk</span>
          {config.pushToTalk && (
            <span style={hintStyle}>Key: {config.pushToTalkKey}</span>
          )}
        </div>
        <ToggleSwitch on={config.pushToTalk} onClick={() => updateConfig({ pushToTalk: !config.pushToTalk })} disabled={saving} />
      </div>

      <div style={dividerStyle} />

      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Speech rate</span>
          <span style={valueStyle}>{config.ttsRate.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={config.ttsRate}
          onChange={(e) => updateConfig({ ttsRate: parseFloat(e.target.value) })}
          style={sliderStyle}
        />
      </div>

      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Speech pitch</span>
          <span style={valueStyle}>{config.ttsPitch.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={config.ttsPitch}
          onChange={(e) => updateConfig({ ttsPitch: parseFloat(e.target.value) })}
          style={sliderStyle}
        />
      </div>

      <div style={dividerStyle} />

      <div style={rowStyle}>
        <div style={rowLabelStyle}>
          <span style={labelStyle}>Voice activity detection</span>
          <span style={hintStyle}>Auto-stops listening when you stop talking</span>
        </div>
        <ToggleSwitch on={config.vadEnabled} onClick={() => updateConfig({ vadEnabled: !config.vadEnabled })} disabled={saving} />
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={toggleBtnStyle}>
      <span style={toggleTrackStyle(on)}>
        <span style={toggleKnobStyle(on)} />
      </span>
    </button>
  );
}

const containerStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-3)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
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

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-mono)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: 0,
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
};

const sliderStyle: React.CSSProperties = {
  width: 100,
  accentColor: 'var(--color-primary)',
  flexShrink: 0,
};

const toggleBtnStyle: React.CSSProperties = {
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
