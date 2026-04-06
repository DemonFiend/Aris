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

  if (!config) return <div style={{ color: '#888', padding: '1rem' }}>Loading...</div>;

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
          <span style={{ fontSize: '0.8rem', color: '#aaa', minWidth: 30 }}>
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
          <span style={{ fontSize: '0.8rem', color: '#aaa', minWidth: 30 }}>
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
  padding: '0.5rem 0',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '1rem',
  fontWeight: 600,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.4rem 0',
  fontSize: '0.9rem',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  margin: '0.15rem 0 0.5rem',
};

const selectStyle: React.CSSProperties = {
  background: '#222',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '0.25rem 0.4rem',
  fontSize: '0.8rem',
};

function toggleBtnStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? '#2563eb' : '#333',
    color: '#fff',
    border: '1px solid ' + (on ? '#2563eb' : '#555'),
    borderRadius: '4px',
    padding: '0.25rem 0.6rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    minWidth: '40px',
  };
}
