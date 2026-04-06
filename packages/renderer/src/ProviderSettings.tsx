import { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig, ModelInfo } from '@aris/shared';

interface ProviderInfo {
  id: string;
  name: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

const PROVIDER_DEFS = [
  { id: 'claude', name: 'Claude (Anthropic)', needsKey: true },
  { id: 'openai', name: 'OpenAI', needsKey: true },
  { id: 'ollama', name: 'Ollama (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://127.0.0.1:11434' },
  { id: 'custom-openai', name: 'Custom OpenAI-compatible', needsKey: true, needsUrl: true, defaultUrl: 'http://127.0.0.1:8000/v1' },
  { id: 'custom-anthropic', name: 'Custom Anthropic-compatible', needsKey: true, needsUrl: true, defaultUrl: 'http://127.0.0.1:8000/v1' },
  { id: 'lmstudio', name: 'LM Studio (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://127.0.0.1:1234/v1' },
];

export function ProviderSettings() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434');
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});

  const loadConfigs = useCallback(async () => {
    const cfgs = (await window.aris.invoke('ai:get-provider-configs')) as ProviderConfig[] | undefined;
    setConfigs(cfgs ?? []);
    const provs = (await window.aris.invoke('ai:get-providers')) as ProviderInfo[] | undefined;
    setProviders(provs ?? []);
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const saveConfig = async (id: string) => {
    const def = PROVIDER_DEFS.find((d) => d.id === id)!;
    const config: ProviderConfig = {
      id,
      enabled: true,
      ...(def.needsKey && apiKey ? { apiKey } : {}),
      ...(def.needsUrl ? { baseUrl } : {}),
    };
    await window.aris.invoke('ai:save-provider-config', config);
    setEditing(null);
    setApiKey('');
    await loadConfigs();
  };

  const testConnection = async (id: string) => {
    setTestStatus((s) => ({ ...s, [id]: 'testing' }));
    try {
      const ok = (await window.aris.invoke('ai:test-connection', id)) as boolean;
      setTestStatus((s) => ({ ...s, [id]: ok ? 'ok' : 'fail' }));
      if (ok) {
        const m = (await window.aris.invoke('ai:get-models', id)) as ModelInfo[] | undefined;
        setModels((prev) => ({ ...prev, [id]: m ?? [] }));
      }
    } catch {
      setTestStatus((s) => ({ ...s, [id]: 'fail' }));
    }
  };

  const setActive = async (id: string) => {
    await window.aris.invoke('ai:set-provider', id);
    await loadConfigs();
  };

  const isRegistered = (id: string) => providers.some((p) => p.id === id);
  const isConfigured = (id: string) => configs.some((c) => c.id === id && c.enabled);

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>AI Providers</h2>

      {PROVIDER_DEFS.map((def) => (
        <div
          key={def.id}
          style={{
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '0.75rem',
            marginBottom: '0.5rem',
            background: isConfigured(def.id) ? '#1a2a1a' : '#1a1a1a',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>{def.name}</strong>
              {isConfigured(def.id) && (
                <span style={{ color: '#4a4', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                  configured
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {isRegistered(def.id) && (
                <>
                  <button onClick={() => testConnection(def.id)} style={btnStyle}>
                    {testStatus[def.id] === 'testing'
                      ? '...'
                      : testStatus[def.id] === 'ok'
                        ? 'OK'
                        : testStatus[def.id] === 'fail'
                          ? 'FAIL'
                          : 'Test'}
                  </button>
                  <button onClick={() => setActive(def.id)} style={btnStyle}>
                    Activate
                  </button>
                </>
              )}
              <button onClick={() => {
                if (editing === def.id) {
                  setEditing(null);
                } else {
                  setEditing(def.id);
                  setApiKey('');
                  setBaseUrl(def.defaultUrl ?? '');
                }
              }} style={btnStyle}>
                {editing === def.id ? 'Cancel' : 'Configure'}
              </button>
            </div>
          </div>

          {editing === def.id && (
            <div style={{ marginTop: '0.5rem' }}>
              {def.needsKey && (
                <input
                  type="password"
                  placeholder="API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={inputStyle}
                />
              )}
              {def.needsUrl && (
                <input
                  type="text"
                  placeholder="Base URL"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  style={inputStyle}
                />
              )}
              <button onClick={() => saveConfig(def.id)} style={{ ...btnStyle, marginTop: '0.25rem' }}>
                Save
              </button>
            </div>
          )}

          {models[def.id]?.length ? (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#888' }}>
              Models: {models[def.id].map((m) => m.name).join(', ')}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '0.25rem 0.5rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem',
  marginTop: '0.25rem',
  background: '#222',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: '4px',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
};
