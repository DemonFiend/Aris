import { useState, useEffect, useCallback } from 'react';
import type { ServiceDetectionResult, ModelInfo, ProviderConfig } from '@aris/shared';
import { APP_NAME } from '@aris/shared';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'provider' | 'voice-services' | 'voice-picker' | 'complete';
type ProviderCategory = 'local' | 'cloud';

const STEPS: Step[] = ['welcome', 'provider', 'voice-services', 'voice-picker', 'complete'];
const STEP_LABELS = ['Welcome', 'AI Provider', 'Voice Services', 'Voice Picker', 'All Done'];

const LOCAL_PROVIDERS = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    desc: 'Run models locally with a GUI',
    icon: '💻',
    serviceName: 'lmstudio' as const,
    defaultUrl: 'http://127.0.0.1:1234',
    needsUrl: true,
    advisory: 'You will need to download a model after installing.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    desc: 'Open-source local model runner',
    icon: '🦙',
    serviceName: null,
    defaultUrl: 'http://127.0.0.1:11434',
    needsUrl: true,
    advisory: 'Run `ollama pull <model>` to download a model.',
  },
];

const CLOUD_PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    desc: 'State-of-the-art reasoning and coding',
    icon: '🧠',
    needsKey: true,
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'openai',
    name: 'OpenAI / ChatGPT',
    desc: 'GPT-4o and latest OpenAI models',
    icon: '💡',
    needsKey: true,
    keyPlaceholder: 'sk-...',
  },
];

export function FirstLaunchWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [category, setCategory] = useState<ProviderCategory>('cloud');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testError, setTestError] = useState('');
  const [services, setServices] = useState<ServiceDetectionResult[] | null>(null);
  const [detectingServices, setDetectingServices] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  useEffect(() => {
    (async () => {
      try {
        const results = (await window.aris.invoke('services:detect-all')) as ServiceDetectionResult[];
        setServices(results);
        // Pre-fill LM Studio URL if detected
        const lms = results.find((r) => r.name === 'lmstudio');
        if (lms?.endpoint) {
          setBaseUrl(lms.endpoint);
        }
      } catch {
        setServices([]);
      }
      setDetectingServices(false);
    })();
  }, []);

  const selectProvider = useCallback(
    (id: string) => {
      setSelectedProvider(id);
      setApiKey('');
      setTestStatus('idle');
      setTestError('');
      setModels([]);
      // Pre-fill URL for local providers
      if (id === 'lmstudio') {
        const lms = services?.find((r) => r.name === 'lmstudio');
        setBaseUrl(lms?.endpoint ?? 'http://127.0.0.1:1234');
      } else if (id === 'ollama') {
        setBaseUrl('http://127.0.0.1:11434');
      } else {
        setBaseUrl('');
      }
    },
    [services],
  );

  const testConnection = useCallback(async () => {
    if (!selectedProvider) return;
    setTestStatus('testing');
    setTestError('');

    try {
      // Save config first so the provider can be registered
      const config: ProviderConfig = {
        id: selectedProvider,
        enabled: true,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      };
      await window.aris.invoke('ai:save-provider-config', config);
      const ok = (await window.aris.invoke('ai:test-connection', selectedProvider)) as boolean;
      setTestStatus(ok ? 'ok' : 'fail');
      if (!ok) setTestError('Connection failed. Check your credentials.');

      if (ok) {
        setLoadingModels(true);
        try {
          const m = (await window.aris.invoke('ai:get-models', selectedProvider)) as ModelInfo[];
          setModels(m ?? []);
        } catch {
          // models not critical
        }
        setLoadingModels(false);
      }
    } catch (err) {
      setTestStatus('fail');
      setTestError(err instanceof Error ? err.message : 'Connection failed.');
    }
  }, [selectedProvider, apiKey, baseUrl]);

  const saveAndFinish = useCallback(async () => {
    setCompleting(true);
    try {
      if (selectedProvider) {
        const config: ProviderConfig = {
          id: selectedProvider,
          enabled: true,
          apiKey: apiKey || undefined,
          baseUrl: baseUrl || undefined,
        };
        await window.aris.invoke('ai:save-provider-config', config);
        await window.aris.invoke('ai:set-provider', selectedProvider);
      }
      await window.aris.invoke('setup:mark-complete');
      onComplete();
    } catch {
      setCompleting(false);
    }
  }, [selectedProvider, apiKey, baseUrl, onComplete]);

  const canProceed = useCallback((): boolean => {
    if (step === 'provider') {
      if (!selectedProvider) return true; // allow skip
      const isCloud = CLOUD_PROVIDERS.some((p) => p.id === selectedProvider);
      if (isCloud) return apiKey.trim().length > 0;
      return baseUrl.trim().length > 0;
    }
    return true;
  }, [step, selectedProvider, apiKey, baseUrl]);

  const next = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }, [step]);

  const back = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }, [step]);

  const lmsResult = services?.find((r) => r.name === 'lmstudio');
  const kokoroResult = services?.find((r) => r.name === 'kokoro');
  const whisperResult = services?.find((r) => r.name === 'whisper');

  return (
    <div style={overlayStyle}>
      <div style={wizardStyle}>
        {/* ── Left sidebar: step indicator ── */}
        <aside style={sidebarStyle}>
          <div style={brandStyle}>
            <span style={brandGlyphStyle}>✦</span>
            <span style={brandNameStyle}>{APP_NAME}</span>
          </div>
          <div style={stepsListStyle}>
            {STEPS.map((s, i) => (
              <div key={s} style={stepItemStyle(i, stepIndex)}>
                <div style={stepBulletStyle(i, stepIndex)}>{i < stepIndex ? '✓' : i + 1}</div>
                <span style={stepLabelStyle(i, stepIndex)}>{STEP_LABELS[i]}</span>
              </div>
            ))}
          </div>
          <div style={sidebarFooterStyle}>
            <div style={progressBarTrackStyle}>
              <div style={progressBarFillStyle(progress)} />
            </div>
            <span style={progressLabelStyle}>{Math.round(progress)}% complete</span>
          </div>
        </aside>

        {/* ── Right content area ── */}
        <main style={contentStyle}>
          {step === 'welcome' && <WelcomeStep />}
          {step === 'provider' && (
            <ProviderStep
              category={category}
              onCategoryChange={setCategory}
              selectedProvider={selectedProvider}
              onSelect={selectProvider}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
              baseUrl={baseUrl}
              onBaseUrlChange={setBaseUrl}
              testStatus={testStatus}
              testError={testError}
              onTest={testConnection}
              services={services}
              detecting={detectingServices}
              models={models}
              loadingModels={loadingModels}
            />
          )}
          {step === 'voice-services' && (
            <VoiceServicesStep
              kokoro={kokoroResult ?? null}
              whisper={whisperResult ?? null}
              detecting={detectingServices}
            />
          )}
          {step === 'voice-picker' && <VoicePickerStep />}
          {step === 'complete' && (
            <CompleteStep
              selectedProvider={selectedProvider}
              kokoro={kokoroResult ?? null}
              whisper={whisperResult ?? null}
            />
          )}

          {/* ── Navigation ── */}
          <div style={navStyle}>
            {stepIndex > 0 ? (
              <button onClick={back} style={backBtnStyle}>
                ← Back
              </button>
            ) : (
              <div />
            )}
            {step !== 'complete' ? (
              <button onClick={next} style={nextBtnStyle} disabled={!canProceed()}>
                Next →
              </button>
            ) : (
              <button
                onClick={saveAndFinish}
                style={finishBtnStyle}
                disabled={completing}
              >
                {completing ? 'Starting up...' : 'Start chatting with Aris ✦'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Step components ────────────────────────────────────── */

function WelcomeStep() {
  return (
    <div style={stepContentStyle}>
      <div style={welcomeIconStyle}>✦</div>
      <h1 style={stepTitleStyle}>Welcome to {APP_NAME}</h1>
      <p style={stepDescStyle}>
        Your AI gaming companion — always watching, always ready to help.
      </p>
      <p style={stepDescStyle}>
        This setup wizard will help you configure your AI provider and voice pipeline
        so {APP_NAME} is ready to go in just a few steps.
      </p>
      <div style={featureListStyle}>
        {[
          '🎮 Context-aware game assistance',
          '💬 Natural conversation with streaming AI',
          '🎤 Voice input and text-to-speech',
          '👁️ Screen capture for visual context',
        ].map((f) => (
          <div key={f} style={featureItemStyle}>
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProviderStepProps {
  category: ProviderCategory;
  onCategoryChange: (c: ProviderCategory) => void;
  selectedProvider: string | null;
  onSelect: (id: string) => void;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  testStatus: 'idle' | 'testing' | 'ok' | 'fail';
  testError: string;
  onTest: () => void;
  services: ServiceDetectionResult[] | null;
  detecting: boolean;
  models: ModelInfo[];
  loadingModels: boolean;
}

function ProviderStep({
  category,
  onCategoryChange,
  selectedProvider,
  onSelect,
  apiKey,
  onApiKeyChange,
  baseUrl,
  onBaseUrlChange,
  testStatus,
  testError,
  onTest,
  services,
  detecting,
  models,
  loadingModels,
}: ProviderStepProps) {
  const lmsResult = services?.find((r) => r.name === 'lmstudio');

  return (
    <div style={stepContentStyle}>
      <h1 style={stepTitleStyle}>Choose Your AI Provider</h1>
      <p style={stepDescStyle}>
        Select how {APP_NAME} will power its responses. You can change this later in Settings.
      </p>

      {/* Category tabs */}
      <div style={tabRowStyle}>
        <button
          style={tabStyle(category === 'cloud')}
          onClick={() => onCategoryChange('cloud')}
        >
          ☁️ Cloud
        </button>
        <button
          style={tabStyle(category === 'local')}
          onClick={() => onCategoryChange('local')}
        >
          💻 Local (Privacy-first)
        </button>
      </div>

      {/* Provider cards */}
      <div style={cardGridStyle}>
        {category === 'cloud' &&
          CLOUD_PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            return (
              <div key={p.id} style={providerCardStyle(isSelected)} onClick={() => onSelect(p.id)}>
                <div style={cardHeaderStyle}>
                  <span style={cardIconStyle}>{p.icon}</span>
                  <div>
                    <div style={cardNameStyle}>{p.name}</div>
                    <div style={cardDescStyle}>{p.desc}</div>
                  </div>
                  <div style={radioStyle(isSelected)} />
                </div>
                {isSelected && (
                  <div style={cardBodyStyle} onClick={(e) => e.stopPropagation()}>
                    <label style={fieldLabelStyle}>API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => onApiKeyChange(e.target.value)}
                      placeholder={p.keyPlaceholder}
                      style={inputStyle}
                      autoFocus
                    />
                    <div style={testRowStyle}>
                      <button
                        onClick={onTest}
                        disabled={!apiKey || testStatus === 'testing'}
                        style={testBtnStyle(testStatus)}
                      >
                        {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                      </button>
                      {testStatus === 'ok' && (
                        <span style={statusBadgeStyle('ok')}>✓ Connected</span>
                      )}
                      {testStatus === 'fail' && (
                        <span style={statusBadgeStyle('fail')}>✗ Failed</span>
                      )}
                    </div>
                    {testError && <p style={errorTextStyle}>{testError}</p>}
                    {testStatus === 'ok' && models.length > 0 && (
                      <p style={advisoryStyle}>
                        {loadingModels ? 'Loading models…' : `${models.length} model(s) available`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {category === 'local' &&
          LOCAL_PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            const svcResult = p.serviceName ? services?.find((r) => r.name === p.serviceName) : null;
            const isDetected = svcResult?.installed || svcResult?.running;
            const isRunning = svcResult?.running;

            return (
              <div key={p.id} style={providerCardStyle(isSelected)} onClick={() => onSelect(p.id)}>
                <div style={cardHeaderStyle}>
                  <span style={cardIconStyle}>{p.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={cardNameStyle}>{p.name}</div>
                    <div style={cardDescStyle}>{p.desc}</div>
                  </div>
                  {detecting ? (
                    <span style={statusBadgeStyle('detecting')}>Detecting…</span>
                  ) : p.serviceName ? (
                    isRunning ? (
                      <span style={statusBadgeStyle('ok')}>✓ Running</span>
                    ) : isDetected ? (
                      <span style={statusBadgeStyle('warn')}>Installed, not running</span>
                    ) : (
                      <span style={statusBadgeStyle('missing')}>Not detected</span>
                    )
                  ) : null}
                  <div style={radioStyle(isSelected)} />
                </div>
                {isSelected && (
                  <div style={cardBodyStyle} onClick={(e) => e.stopPropagation()}>
                    {!isDetected && p.serviceName === 'lmstudio' && (
                      <p style={advisoryStyle}>
                        LM Studio not found. Download it at{' '}
                        <strong>lmstudio.ai</strong> and start the local server. Advisory:{' '}
                        {p.advisory}
                      </p>
                    )}
                    {!isDetected && p.id === 'ollama' && (
                      <p style={advisoryStyle}>
                        Ollama not detected. Install it from{' '}
                        <strong>ollama.ai</strong>. {p.advisory}
                      </p>
                    )}
                    {isDetected && p.advisory && (
                      <p style={advisoryStyle}>{p.advisory}</p>
                    )}
                    <label style={fieldLabelStyle}>Endpoint URL</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => onBaseUrlChange(e.target.value)}
                      placeholder={p.defaultUrl}
                      style={inputStyle}
                    />
                    {p.serviceName === 'lmstudio' && lmsResult?.running && lmsResult.endpoint && (
                      <p style={successTextStyle}>
                        Auto-detected at {lmsResult.endpoint}
                        {lmsResult.version ? ` (v${lmsResult.version})` : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {!selectedProvider && (
        <p style={skipHintStyle}>
          You can skip this step and configure a provider later in Settings → Providers.
        </p>
      )}
    </div>
  );
}

interface VoiceServicesStepProps {
  kokoro: ServiceDetectionResult | null;
  whisper: ServiceDetectionResult | null;
  detecting: boolean;
}

function VoiceServicesStep({ kokoro, whisper, detecting }: VoiceServicesStepProps) {
  return (
    <div style={stepContentStyle}>
      <h1 style={stepTitleStyle}>Voice Services</h1>
      <p style={stepDescStyle}>
        {APP_NAME} supports local voice services for privacy-first TTS and STT. Both are
        optional — web-speech fallback is always available.
      </p>

      <div style={voiceServiceListStyle}>
        <VoiceServiceCard
          name="Kokoro TTS"
          role="Text-to-Speech"
          icon="🔊"
          result={kokoro}
          detecting={detecting}
          installHint="Install Kokoro-FastAPI to enable high-quality local voice synthesis. Run it on port 8880."
          installUrl="github.com/remsky/Kokoro-FastAPI"
        />
        <VoiceServiceCard
          name="Whisper STT"
          role="Speech-to-Text"
          icon="🎤"
          result={whisper}
          detecting={detecting}
          installHint="Install whisper.cpp server to enable offline speech recognition. Run it on port 8001."
          installUrl="github.com/ggerganov/whisper.cpp"
        />
      </div>

      <p style={skipHintStyle}>
        Voice services can be configured anytime in Settings → Voice. Web Speech API is used
        as a fallback when local services are unavailable.
      </p>
    </div>
  );
}

interface VoiceServiceCardProps {
  name: string;
  role: string;
  icon: string;
  result: ServiceDetectionResult | null;
  detecting: boolean;
  installHint: string;
  installUrl: string;
}

function VoiceServiceCard({
  name,
  role,
  icon,
  result,
  detecting,
  installHint,
  installUrl,
}: VoiceServiceCardProps) {
  const isRunning = result?.running;
  const isInstalled = result?.installed;

  return (
    <div style={voiceCardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardIconStyle}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={cardNameStyle}>{name}</div>
          <div style={cardDescStyle}>{role}</div>
        </div>
        {detecting ? (
          <span style={statusBadgeStyle('detecting')}>Detecting…</span>
        ) : isRunning ? (
          <span style={statusBadgeStyle('ok')}>
            ✓ Running{result?.version ? ` v${result.version}` : ''}
          </span>
        ) : isInstalled ? (
          <span style={statusBadgeStyle('warn')}>Installed, not running</span>
        ) : (
          <span style={statusBadgeStyle('missing')}>Not detected</span>
        )}
      </div>
      {!isRunning && !detecting && (
        <div style={cardBodyStyle}>
          <p style={advisoryStyle}>
            {installHint}{' '}
            <a
              href={`https://${installUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              {installUrl}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

function VoicePickerStep() {
  return (
    <div style={stepContentStyle}>
      <div style={welcomeIconStyle}>🎙️</div>
      <h1 style={stepTitleStyle}>Voice Picker</h1>
      <p style={stepDescStyle}>
        Browse and preview Kokoro TTS voices to find the perfect voice for {APP_NAME}.
      </p>
      <div style={placeholderBoxStyle}>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Voice browsing and preview will be available in the next update (ARI-147).
        </p>
        <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
          You can select a voice anytime in <strong>Settings → Voice</strong>.
        </p>
      </div>
    </div>
  );
}

interface CompleteStepProps {
  selectedProvider: string | null;
  kokoro: ServiceDetectionResult | null;
  whisper: ServiceDetectionResult | null;
}

function CompleteStep({ selectedProvider, kokoro, whisper }: CompleteStepProps) {
  const providerName =
    [...CLOUD_PROVIDERS, ...LOCAL_PROVIDERS].find((p) => p.id === selectedProvider)?.name ??
    null;

  return (
    <div style={stepContentStyle}>
      <div style={welcomeIconStyle}>🎉</div>
      <h1 style={stepTitleStyle}>You're all set!</h1>
      <p style={stepDescStyle}>
        Here's a summary of your setup. You can adjust anything later in Settings.
      </p>

      <div style={summaryListStyle}>
        <SummaryRow
          label="AI Provider"
          value={providerName ?? 'None configured'}
          ok={!!selectedProvider}
        />
        <SummaryRow
          label="Kokoro TTS"
          value={kokoro?.running ? `Running (${kokoro.endpoint})` : 'Not available — web-speech fallback'}
          ok={!!kokoro?.running}
        />
        <SummaryRow
          label="Whisper STT"
          value={whisper?.running ? `Running (${whisper.endpoint})` : 'Not available — web-speech fallback'}
          ok={!!whisper?.running}
        />
      </div>

      {!selectedProvider && (
        <p style={advisoryStyle}>
          You haven't set up an AI provider yet. {APP_NAME} needs one to respond to
          messages — configure it in <strong>Settings → Providers</strong> before
          starting a conversation.
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={summaryRowStyle}>
      <span style={summaryLabelStyle}>{label}</span>
      <div style={summaryValueRowStyle}>
        <span style={summaryDotStyle(ok)} />
        <span style={summaryValueStyle}>{value}</span>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────── */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--bg-canvas)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const wizardStyle: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  height: '100%',
  maxWidth: 860,
  maxHeight: 620,
  margin: 'auto',
  background: 'var(--bg-base)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--border-default)',
  boxShadow: 'var(--shadow-lg)',
  overflow: 'hidden',
};

const sidebarStyle: React.CSSProperties = {
  width: 200,
  flexShrink: 0,
  background: 'var(--bg-surface)',
  borderRight: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  padding: 'var(--space-6) var(--space-4)',
  gap: 'var(--space-6)',
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const brandGlyphStyle: React.CSSProperties = {
  color: 'var(--color-primary)',
  fontSize: '1.25rem',
  textShadow: '0 0 8px rgba(0,230,118,0.5)',
};

const brandNameStyle: React.CSSProperties = {
  color: 'var(--text-accent)',
  fontWeight: 'var(--font-bold)' as any,
  fontSize: 'var(--text-lg)',
  letterSpacing: '0.05em',
  textTransform: 'uppercase' as any,
};

const stepsListStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

function stepItemStyle(i: number, current: number): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    opacity: i > current ? 0.4 : 1,
  };
}

function stepBulletStyle(i: number, current: number): React.CSSProperties {
  const done = i < current;
  const active = i === current;
  return {
    width: 24,
    height: 24,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-bold)' as any,
    flexShrink: 0,
    background: done
      ? 'var(--color-success)'
      : active
        ? 'var(--color-primary-subtle)'
        : 'var(--bg-elevated)',
    color: done ? '#000' : active ? 'var(--color-primary)' : 'var(--text-muted)',
    border: active ? '1px solid var(--color-primary)' : '1px solid transparent',
  };
}

function stepLabelStyle(i: number, current: number): React.CSSProperties {
  return {
    fontSize: 'var(--text-sm)',
    color:
      i === current
        ? 'var(--text-primary)'
        : i < current
          ? 'var(--color-success)'
          : 'var(--text-muted)',
    fontWeight: i === current ? ('var(--font-semibold)' as any) : undefined,
  };
}

const sidebarFooterStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};

const progressBarTrackStyle: React.CSSProperties = {
  height: 4,
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
};

function progressBarFillStyle(pct: number): React.CSSProperties {
  return {
    height: '100%',
    width: `${pct}%`,
    background: 'var(--color-primary)',
    borderRadius: 'var(--radius-full)',
    transition: 'width var(--transition-slow)',
    boxShadow: 'var(--shadow-glow-sm)',
  };
}

const progressLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const stepContentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 'var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const navStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--space-4) var(--space-8)',
  borderTop: '1px solid var(--border-subtle)',
  background: 'var(--bg-base)',
};

const backBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-default)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  transition: 'var(--transition-fast)',
};

const nextBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  border: '1px solid var(--border-strong)',
  color: 'var(--color-primary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-6)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
};

const finishBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  border: 'none',
  color: 'var(--color-primary-on)',
  borderRadius: 'var(--radius-full)',
  padding: 'var(--space-3) var(--space-8)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-semibold)' as any,
  transition: 'var(--transition-fast)',
  boxShadow: 'var(--shadow-glow-sm)',
};

const welcomeIconStyle: React.CSSProperties = {
  fontSize: '3rem',
  textAlign: 'center',
  textShadow: '0 0 20px rgba(0, 230, 118, 0.4)',
};

const stepTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-2xl)',
  fontWeight: 'var(--font-bold)' as any,
  color: 'var(--text-primary)',
};

const stepDescStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-base)',
  lineHeight: 'var(--leading-relaxed)',
};

const featureListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-2)',
};

const featureItemStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
};

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: 'var(--space-2) var(--space-4)',
    borderRadius: 'var(--radius-md)',
    border: active ? '1px solid var(--border-strong)' : '1px solid var(--border-muted)',
    background: active ? 'var(--color-primary-subtle)' : 'transparent',
    color: active ? 'var(--color-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    fontWeight: active ? ('var(--font-semibold)' as any) : undefined,
    transition: 'var(--transition-fast)',
  };
}

const cardGridStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

function providerCardStyle(selected: boolean): React.CSSProperties {
  return {
    background: selected ? 'var(--bg-active)' : 'var(--bg-surface)',
    border: selected ? '1px solid var(--bg-active-border)' : '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
  };
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

const cardIconStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  flexShrink: 0,
};

const cardNameStyle: React.CSSProperties = {
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
  fontSize: 'var(--text-base)',
};

const cardDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  marginTop: 2,
};

function radioStyle(selected: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: selected ? '2px solid var(--color-primary)' : '2px solid var(--border-default)',
    background: selected ? 'var(--color-primary)' : 'transparent',
    flexShrink: 0,
    marginLeft: 'auto',
    transition: 'var(--transition-fast)',
  };
}

const cardBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingTop: 'var(--space-2)',
  borderTop: '1px solid var(--border-subtle)',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  fontWeight: 'var(--font-medium)' as any,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 'var(--space-2) var(--space-3)',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
  boxSizing: 'border-box',
};

const testRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

function testBtnStyle(status: 'idle' | 'testing' | 'ok' | 'fail'): React.CSSProperties {
  return {
    padding: 'var(--space-1) var(--space-4)',
    background: status === 'ok' ? 'var(--color-success-bg)' : 'var(--bg-elevated)',
    border:
      status === 'ok'
        ? '1px solid var(--color-success)'
        : status === 'fail'
          ? '1px solid var(--color-error)'
          : '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    color:
      status === 'ok'
        ? 'var(--color-success)'
        : status === 'fail'
          ? 'var(--color-error)'
          : 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    transition: 'var(--transition-fast)',
  };
}

function statusBadgeStyle(kind: 'ok' | 'fail' | 'warn' | 'missing' | 'detecting'): React.CSSProperties {
  const colors = {
    ok: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
    fail: { bg: 'var(--color-error-bg)', color: 'var(--color-error)' },
    warn: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
    missing: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
    detecting: { bg: 'var(--color-info-bg)', color: 'var(--color-info)' },
  };
  const c = colors[kind];
  return {
    background: c.bg,
    color: c.color,
    borderRadius: 'var(--radius-full)',
    padding: '2px 8px',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-medium)' as any,
    whiteSpace: 'nowrap' as const,
  };
}

const errorTextStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-error)',
  fontSize: 'var(--text-sm)',
};

const successTextStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--color-success)',
  fontSize: 'var(--text-sm)',
};

const advisoryStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--leading-relaxed)',
};

const skipHintStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-xs)',
  fontStyle: 'italic',
};

const voiceServiceListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--color-primary)',
  textDecoration: 'underline',
  cursor: 'pointer',
};

const voiceCardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const placeholderBoxStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px dashed var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-8)',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  alignItems: 'center',
};

const summaryListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-subtle)',
  padding: 'var(--space-4)',
};

const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  paddingBottom: 'var(--space-3)',
  borderBottom: '1px solid var(--border-subtle)',
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase' as any,
  letterSpacing: '0.06em',
};

const summaryValueRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

function summaryDotStyle(ok: boolean): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: ok ? 'var(--color-success)' : 'var(--text-muted)',
    flexShrink: 0,
  };
}

const summaryValueStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
};
