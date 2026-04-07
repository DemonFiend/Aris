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
    <div style={sectionStyle}>
      <h3 style={headingStyle}>Voice Settings</h3>

      <div style={rowStyle}>
        <span>Language</span>
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

      <div style={rowStyle}>
        <span>Push-to-talk</span>
        <button
          onClick={() => updateConfig({ pushToTalk: !config.pushToTalk })}
          style={toggleBtnStyle(config.pushToTalk)}
          disabled={saving}
        >
          {config.pushToTalk ? 'ON' : 'OFF'}
        </button>
      </div>
      {config.pushToTalk && (
        <p style={hintStyle}>Key: {config.pushToTalkKey} — press to toggle voice input</p>
      )}

      <div style={rowStyle}>
        <span>Speech rate</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={config.ttsRate}
            onChange={(e) => updateConfig({ ttsRate: parseFloat(e.target.value) })}
            style={{ width: 100 }}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 30 }}>
            {config.ttsRate.toFixed(1)}
          </span>
        </div>
      </div>

      <div style={rowStyle}>
        <span>Speech pitch</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={config.ttsPitch}
            onChange={(e) => updateConfig({ ttsPitch: parseFloat(e.target.value) })}
            style={{ width: 100 }}
          />
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', minWidth: 30 }}>
            {config.ttsPitch.toFixed(1)}
          </span>
        </div>
      </div>

      <div style={rowStyle}>
        <span>Voice activity detection</span>
        <button
          onClick={() => updateConfig({ vadEnabled: !config.vadEnabled })}
          style={toggleBtnStyle(config.vadEnabled)}
          disabled={saving}
        >
          {config.vadEnabled ? 'ON' : 'OFF'}
        </button>
      </div>
      <p style={hintStyle}>
        When enabled, stops listening automatically when you stop talking.
      </p>
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

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-1) 0',
  fontSize: 'var(--text-base)',
};

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 'var(--space-1) 0 var(--space-2)',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  fontSize: 'var(--text-sm)',
};

function toggleBtnStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? 'var(--color-primary)' : 'var(--bg-elevated)',
    color: on ? 'var(--color-primary-on)' : 'var(--text-primary)',
    border: '1px solid ' + (on ? 'var(--color-primary)' : 'var(--border-default)'),
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1) var(--space-2)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-semibold)' as any,
    minWidth: '40px',
    transition: 'var(--transition-fast)',
  };
}
