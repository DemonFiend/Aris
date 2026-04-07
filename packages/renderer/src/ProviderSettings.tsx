import { useState, useEffect, useCallback } from 'react';
import type { ProviderConfig, ModelInfo } from '@aris/shared';

interface ProviderInfo {
  id: string;
  name: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

const PROVIDER_DEFS = [
  { id: 'claude', name: 'Claude (Anthropic)', needsKey: true, icon: '\uD83E\uDDE0' },
  { id: 'openai', name: 'OpenAI', needsKey: true, icon: '\uD83D\uDCA1' },
  { id: 'ollama', name: 'Ollama (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://127.0.0.1:11434', icon: '\uD83E\uDD99' },
  { id: 'custom-openai', name: 'Custom OpenAI-compatible', needsKey: true, needsUrl: true, defaultUrl: 'http://127.0.0.1:8000/v1', icon: '\uD83D\uDD27' },
  { id: 'custom-anthropic', name: 'Custom Anthropic-compatible', needsKey: true, needsUrl: true, defaultUrl: 'http://127.0.0.1:8000/v1', icon: '\uD83D\uDD27' },
  { id: 'lmstudio', name: 'LM Studio (Local)', needsKey: false, needsUrl: true, defaultUrl: 'http://127.0.0.1:1234', icon: '\uD83D\uDCBB' },
];

export function ProviderSettings() {
  const [configs, setConfigs] = useState<ProviderConfig[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:11434');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelInput, setCustomModelInput] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [models, setModels] = useState<Record<string, ModelInfo[]>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    const cfgs = (await window.aris.invoke('ai:get-provider-configs')) as ProviderConfig[] | undefined;
    setConfigs(cfgs ?? []);
    const provs = (await window.aris.invoke('ai:get-providers')) as ProviderInfo[] | undefined;
    setProviders(provs ?? []);
    const active = (await window.aris.invoke('ai:get-active-provider')) as string | null;
    setActiveProviderId(active);
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

  const toggleExpand = useCallback(
    (id: string) => {
      if (expanded === id) {
        setExpanded(null);
        return;
      }
      const def = PROVIDER_DEFS.find((d) => d.id === id)!;
      const cfg = configs.find((c) => c.id === id);
      setExpanded(id);
      setSaveError(null);
      setApiKey('');
      setBaseUrl(cfg?.baseUrl || def.defaultUrl || '');
      const currentModel = cfg?.defaultModel ?? '';
      setSelectedModel(currentModel);
      setCustomModelInput('');
      setUseCustomModel(false);

      if (providers.some((p) => p.id === id)) {
        fetchModels(id);
      }
    },
    [expanded, configs, providers, fetchModels],
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
    try {
      setSaveError(null);
      await window.aris.invoke('ai:save-provider-config', config);
      setExpanded(null);
      setApiKey('');
      setSelectedModel('');
      setCustomModelInput('');
      setUseCustomModel(false);
      await loadConfigs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save provider config';
      setSaveError(msg.replace(/^Error invoking remote method '[^']+': /, ''));
    }
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

  const clearActive = async () => {
    await window.aris.invoke('ai:clear-provider');
    await loadConfigs();
  };

  const isRegistered = (id: string) => providers.some((p) => p.id === id);
  const isConfigured = (id: string) => configs.some((c) => c.id === id && c.enabled);
  const getConfig = (id: string) => configs.find((c) => c.id === id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
      {PROVIDER_DEFS.map((def) => {
        const cfg = getConfig(def.id);
        const configured = isConfigured(def.id);
        const registered = isRegistered(def.id);
        const isExpanded = expanded === def.id;
        const test = testStatus[def.id] ?? 'idle';

        return (
          <div key={def.id} style={cardStyle(configured, isExpanded)}>
            {/* Card header — clickable to expand */}
            <button onClick={() => toggleExpand(def.id)} style={cardHeaderStyle}>
              <div style={cardHeaderLeftStyle}>
                <span style={iconStyle}>{def.icon}</span>
                <div>
                  <div style={providerNameStyle}>{def.name}</div>
                  {cfg?.defaultModel && (
                    <div style={modelTagStyle}>{cfg.defaultModel}</div>
                  )}
                </div>
              </div>
              <div style={cardHeaderRightStyle}>
                {configured && <span style={statusDotStyle(activeProviderId === def.id)} />}
                {activeProviderId === def.id && <span style={activeLabelStyle}>Active</span>}
                <span style={chevronStyle(isExpanded)}>{'\u276F'}</span>
              </div>
            </button>

            {/* Quick actions bar — visible when configured but not expanded */}
            {registered && !isExpanded && (
              <div style={quickActionsStyle}>
                <button
                  onClick={(e) => { e.stopPropagation(); testConnection(def.id); }}
                  style={chipBtnStyle(test === 'ok' ? 'success' : test === 'fail' ? 'error' : 'default')}
                >
                  {test === 'testing' ? 'Testing...' : test === 'ok' ? 'Connected' : test === 'fail' ? 'Failed' : 'Test'}
                </button>
                {activeProviderId === def.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearActive(); }}
                    style={chipBtnStyle('success')}
                  >
                    Active
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setActive(def.id); }}
                    style={chipBtnStyle('primary')}
                  >
                    Activate
                  </button>
                )}
              </div>
            )}

            {/* Expanded config form */}
            {isExpanded && (
              <div style={cardBodyStyle}>
                {def.needsKey && (
                  <div style={fieldGroupStyle}>
                    <label style={fieldLabelStyle}>API Key</label>
                    <input
                      type="password"
                      placeholder={cfg?.apiKey ? 'Key saved (enter new to update)' : 'Enter API key'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                )}

                {def.needsUrl && (
                  <div style={fieldGroupStyle}>
                    <label style={fieldLabelStyle}>Base URL</label>
                    <input
                      type="text"
                      placeholder="http://127.0.0.1:..."
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Model selection */}
                <div style={fieldGroupStyle}>
                  <label style={fieldLabelStyle}>Model</label>
                  {loadingModels[def.id] ? (
                    <div style={loadingTextStyle}>Loading models...</div>
                  ) : (models[def.id]?.length ?? 0) > 0 && !useCustomModel ? (
                    <>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">-- Select a model --</option>
                        {models[def.id].map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => { setUseCustomModel(true); setCustomModelInput(selectedModel); }}
                        style={linkBtnStyle}
                      >
                        Enter custom model ID instead
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Model ID (e.g. gpt-4o, claude-sonnet-4-20250514)"
                        value={useCustomModel ? customModelInput : selectedModel}
                        onChange={(e) => {
                          if (useCustomModel) setCustomModelInput(e.target.value);
                          else setSelectedModel(e.target.value);
                        }}
                        style={inputStyle}
                      />
                      {useCustomModel && (models[def.id]?.length ?? 0) > 0 && (
                        <button
                          onClick={() => { setUseCustomModel(false); setSelectedModel(customModelInput); }}
                          style={linkBtnStyle}
                        >
                          Pick from available models
                        </button>
                      )}
                      {registered && !loadingModels[def.id] && (models[def.id]?.length ?? 0) === 0 && (
                        <button onClick={() => fetchModels(def.id)} style={linkBtnStyle}>
                          Refresh model list
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Action buttons */}
                <div style={cardActionsStyle}>
                  {registered && (
                    <>
                      <button
                        onClick={() => testConnection(def.id)}
                        style={chipBtnStyle(test === 'ok' ? 'success' : test === 'fail' ? 'error' : 'default')}
                      >
                        {test === 'testing' ? 'Testing...' : test === 'ok' ? 'Connected' : test === 'fail' ? 'Failed' : 'Test Connection'}
                      </button>
                      {activeProviderId === def.id ? (
                        <button onClick={() => clearActive()} style={chipBtnStyle('success')}>
                          Active
                        </button>
                      ) : (
                        <button onClick={() => setActive(def.id)} style={chipBtnStyle('default')}>
                          Activate
                        </button>
                      )}
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button onClick={() => saveConfig(def.id)} style={saveBtnStyle}>
                    Save
                  </button>
                </div>
                {saveError && (
                  <div style={{ color: 'var(--color-error, #ef4444)', fontSize: 'var(--font-xs, 12px)', marginTop: 'var(--space-1, 4px)' }}>
                    {saveError}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Styles ── */

function cardStyle(configured: boolean, expanded: boolean): React.CSSProperties {
  return {
    background: 'var(--bg-elevated)',
    border: `1px solid ${configured ? 'var(--border-default)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    transition: 'var(--transition-normal)',
    ...(expanded ? { boxShadow: 'var(--shadow-md)' } : {}),
  };
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: 'var(--space-3) var(--space-4)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--text-primary)',
};

const cardHeaderLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minWidth: 0,
};

const iconStyle: React.CSSProperties = {
  fontSize: 'var(--text-lg)',
  lineHeight: 1,
};

const providerNameStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
};

const modelTagStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginTop: 2,
};

const cardHeaderRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexShrink: 0,
};

function statusDotStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? 'var(--color-success)' : 'var(--text-muted)',
    boxShadow: active ? '0 0 6px var(--color-success)' : 'none',
  };
}

const activeLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--color-success)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function chevronStyle(open: boolean): React.CSSProperties {
  return {
    fontSize: 'var(--text-sm)',
    color: 'var(--text-muted)',
    transition: 'var(--transition-fast)',
    transform: open ? 'rotate(90deg)' : 'rotate(0)',
  };
}

const quickActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  padding: '0 var(--space-4) var(--space-3)',
};

const cardBodyStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4) var(--space-4)',
  borderTop: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

const loadingTextStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  padding: 'var(--space-1) 0',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  color: 'var(--text-accent)',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  textDecoration: 'underline',
  textAlign: 'left',
};

const cardActionsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  paddingTop: 'var(--space-1)',
};

function chipBtnStyle(variant: 'default' | 'primary' | 'success' | 'error'): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 'var(--radius-full)',
    padding: 'var(--space-1) var(--space-3)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)' as any,
    transition: 'var(--transition-fast)',
    whiteSpace: 'nowrap',
    border: 'none',
  };
  switch (variant) {
    case 'primary':
      return { ...base, background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' };
    case 'success':
      return { ...base, background: 'var(--color-success-bg)', color: 'var(--color-success)' };
    case 'error':
      return { ...base, background: 'var(--color-error-bg)', color: 'var(--color-error)' };
    default:
      return { ...base, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' };
  }
}

const saveBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-primary-on)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-5)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};
