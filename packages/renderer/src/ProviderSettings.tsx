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
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});

  const loadConfigs = useCallback(async () => {
    const cfgs = (await window.aris.invoke('ai:get-provider-configs')) as ProviderConfig[] | undefined;
    setConfigs(cfgs ?? []);
    const provs = (await window.aris.invoke('ai:get-providers')) as ProviderInfo[] | undefined;
    setProviders(provs ?? []);
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const fetchModels = useCallback(async (id: string) => {
    setLoadingModels((s) => ({ ...s, [id]: true }));
    try {
      const m = (await window.aris.invoke('ai:get-models', id)) as ModelInfo[] | undefined;
      setModels((prev) => ({ ...prev, [id]: m ?? [] }));
    } catch {
      // Provider may not be registered yet
    }
    setLoadingModels((s) => ({ ...s, [id]: false }));
  }, []);

  const openEditor = useCallback(
    (id: string) => {
      const def = PROVIDER_DEFS.find((d) => d.id === id)!;
      const cfg = configs.find((c) => c.id === id);
      setEditing(id);
      setApiKey('');
      setBaseUrl(cfg?.baseUrl ?? def.defaultUrl ?? '');
      const currentModel = cfg?.defaultModel ?? '';
      setSelectedModel(currentModel);
      setCustomModelInput('');
      setUseCustomModel(false);

      // Fetch models if provider is already registered
      if (providers.some((p) => p.id === id)) {
        fetchModels(id);
      }
    },
    [configs, providers, fetchModels],
  );

  const getEffectiveModel = (): string => {
    if (useCustomModel) return customModelInput;
    return selectedModel;
  };

  const saveConfig = async (id: string) => {
    const def = PROVIDER_DEFS.find((d) => d.id === id)!;
    const model = getEffectiveModel();
    const config: ProviderConfig = {
      id,
      enabled: true,
      ...(def.needsKey && apiKey ? { apiKey } : {}),
      ...(def.needsUrl ? { baseUrl } : {}),
      ...(model ? { defaultModel: model } : {}),
    };
    await window.aris.invoke('ai:save-provider-config', config);
    setEditing(null);
    setApiKey('');
    setSelectedModel('');
    setCustomModelInput('');
    setUseCustomModel(false);
    await loadConfigs();
  };

  const testConnection = async (id: string) => {
    setTestStatus((s) => ({ ...s, [id]: 'testing' }));
    try {
      const ok = (await window.aris.invoke('ai:test-connection', id)) as boolean;
      setTestStatus((s) => ({ ...s, [id]: ok ? 'ok' : 'fail' }));
      if (ok) {
        await fetchModels(id);
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
  const getConfig = (id: string) => configs.find((c) => c.id === id);

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>AI Providers</h2>

      {PROVIDER_DEFS.map((def) => {
        const cfg = getConfig(def.id);
        return (
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
                {cfg?.defaultModel && (
                  <span style={{ color: '#888', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                    model: {cfg.defaultModel}
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
                <button
                  onClick={() => {
                    if (editing === def.id) {
                      setEditing(null);
                    } else {
                      openEditor(def.id);
                    }
                  }}
                  style={btnStyle}
                >
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

                {/* Model selection */}
                <div style={{ marginTop: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', color: '#aaa', display: 'block', marginBottom: '0.2rem' }}>
                    Model
                  </label>
                  {loadingModels[def.id] ? (
                    <div style={{ fontSize: '0.8rem', color: '#888', padding: '0.4rem 0' }}>
                      Loading models...
                    </div>
                  ) : (models[def.id]?.length ?? 0) > 0 && !useCustomModel ? (
                    <>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">-- Select a model --</option>
                        {models[def.id].map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          setUseCustomModel(true);
                          setCustomModelInput(selectedModel);
                        }}
                        style={{ ...linkBtnStyle, marginTop: '0.2rem' }}
                      >
                        Enter custom model ID
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Model ID (e.g. gpt-4o, claude-sonnet-4-20250514)"
                        value={useCustomModel ? customModelInput : selectedModel}
                        onChange={(e) => {
                          if (useCustomModel) {
                            setCustomModelInput(e.target.value);
                          } else {
                            setSelectedModel(e.target.value);
                          }
                        }}
                        style={inputStyle}
                      />
                      {useCustomModel && (models[def.id]?.length ?? 0) > 0 && (
                        <button
                          onClick={() => {
                            setUseCustomModel(false);
                            setSelectedModel(customModelInput);
                          }}
                          style={{ ...linkBtnStyle, marginTop: '0.2rem' }}
                        >
                          Pick from available models
                        </button>
                      )}
                      {isRegistered(def.id) && !loadingModels[def.id] && (models[def.id]?.length ?? 0) === 0 && (
                        <button
                          onClick={() => fetchModels(def.id)}
                          style={{ ...linkBtnStyle, marginTop: '0.2rem' }}
                        >
                          Refresh model list
                        </button>
                      )}
                    </>
                  )}
                </div>

                <button onClick={() => saveConfig(def.id)} style={{ ...btnStyle, marginTop: '0.5rem' }}>
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}
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

const selectStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.4rem',
  background: '#222',
  color: '#eee',
  border: '1px solid #444',
  borderRadius: '4px',
  fontSize: '0.85rem',
  boxSizing: 'border-box',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  color: '#6af',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: '0.75rem',
  textDecoration: 'underline',
};
