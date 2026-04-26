import { useState, useEffect, useCallback, useRef } from 'react';
import type { GpuRuntime, ServiceInstallInfo, ServiceName, QuickInstallProgress, QuickInstallResult } from '@aris/shared';

interface TTSProviderInfo {
  id: string;
  name: string;
  isLocal: boolean;
  hardwareClass: 'cpu' | 'gpu' | 'cloud';
  requirements: { minVramMb?: number; needsGpuRuntime?: boolean } | null;
}

/** Static catalog — drives the install CTAs for providers that aren't registered yet. */
const KNOWN_PROVIDERS: Array<{
  id: string;
  name: string;
  hardwareClass: 'cpu' | 'gpu';
  serviceName: 'kokoro' | 'f5-tts' | 'sesame-csm';
  description: string;
  badge?: string;
}> = [
  {
    id: 'kokoro',
    name: 'Kokoro TTS',
    hardwareClass: 'cpu',
    serviceName: 'kokoro',
    description: 'Lightweight local TTS — runs on CPU alongside your game.',
  },
  {
    id: 'f5-tts',
    name: 'F5-TTS',
    hardwareClass: 'gpu',
    serviceName: 'f5-tts',
    description: 'High-quality local TTS with voice cloning. Runs on NVIDIA, AMD, or Apple GPUs.',
  },
  {
    id: 'sesame-csm',
    name: 'Sesame CSM',
    hardwareClass: 'gpu',
    serviceName: 'sesame-csm',
    description: 'Conversational speech model with emotional inflection — pairs with the avatar expression system. Heavier setup.',
    badge: 'ADVANCED',
  },
];

export function TTSProviderSettings() {
  const [registered, setRegistered] = useState<TTSProviderInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gpu, setGpu] = useState<GpuRuntime | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [setupOpen, setSetupOpen] = useState<string | null>(null);
  const [setupInfo, setSetupInfo] = useState<ServiceInstallInfo | null>(null);
  const [installInfos, setInstallInfos] = useState<Partial<Record<string, ServiceInstallInfo>>>({});

  // Quick Install state — null when no install is in flight.
  const [installing, setInstalling] = useState<{
    serviceName: ServiceName;
    displayName: string;
    percent: number;
    stage: string;
    message: string;
    log: string[];
    result: QuickInstallResult | null;
  } | null>(null);
  const installRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const list = (await window.aris.invoke('tts:list-providers')) as TTSProviderInfo[];
    setRegistered(list);
    const active = (await window.aris.invoke('tts:get-active-provider')) as string | null;
    setActiveId(active);
  }, []);

  useEffect(() => {
    refresh();
    void (async () => {
      try {
        const runtime = (await window.aris.invoke('hardware:gpu-runtime')) as GpuRuntime;
        setGpu(runtime);
      } catch {
        // hardware probe unavailable — UI degrades gracefully
      }
      // Eagerly fetch install info so the Quick Install button renders without
      // waiting for the user to expand a card.
      const infos: Partial<Record<string, ServiceInstallInfo>> = {};
      for (const known of KNOWN_PROVIDERS) {
        try {
          const info = (await window.aris.invoke('install:get-info', known.serviceName)) as ServiceInstallInfo;
          infos[known.id] = info;
        } catch {
          // ignore — provider just won't show a Quick Install button
        }
      }
      setInstallInfos(infos);
    })();
  }, [refresh]);

  // Listen for streaming Quick Install progress events from the main process.
  useEffect(() => {
    return window.aris.on('install:quick-install-progress', (raw: unknown) => {
      const p = raw as QuickInstallProgress;
      setInstalling((curr) => {
        if (!curr || curr.serviceName !== p.service) return curr;
        const log = p.line ? [...curr.log, p.line].slice(-200) : curr.log;
        // Sentinel `-1` means "no percent change, log line only"
        const percent = (p.percent as number) >= 0 ? p.percent : curr.percent;
        const stage = p.stage && p.percent >= 0 ? p.stage : curr.stage;
        const message = p.message || curr.message;
        return { ...curr, percent, stage, message, log };
      });
    });
  }, []);

  // While an install is in flight, poll the registry every few seconds so the
  // newly-installed provider appears as Active without a manual refresh.
  useEffect(() => {
    if (!installing || installing.result) return;
    installRefreshTimer.current = setInterval(() => {
      void refresh();
    }, 4000);
    return () => {
      if (installRefreshTimer.current) {
        clearInterval(installRefreshTimer.current);
        installRefreshTimer.current = null;
      }
    };
  }, [installing, refresh]);

  const isRegistered = (id: string) => registered.some((p) => p.id === id);

  const test = async (id: string) => {
    setTestStatus((s) => ({ ...s, [id]: 'testing' }));
    try {
      const ok = (await window.aris.invoke('tts:test-connection', id)) as boolean;
      setTestStatus((s) => ({ ...s, [id]: ok ? 'ok' : 'fail' }));
    } catch {
      setTestStatus((s) => ({ ...s, [id]: 'fail' }));
    }
  };

  const activate = async (id: string) => {
    await window.aris.invoke('tts:set-provider', id);
    await refresh();
  };

  const clearActive = async () => {
    await window.aris.invoke('tts:clear-provider');
    await refresh();
  };

  const startQuickInstall = async (serviceName: ServiceName, displayName: string) => {
    setInstalling({
      serviceName,
      displayName,
      percent: 0,
      stage: 'starting',
      message: 'Preparing install...',
      log: [],
      result: null,
    });
    try {
      const result = (await window.aris.invoke('install:run-quick-install', serviceName)) as QuickInstallResult;
      setInstalling((curr) => (curr && curr.serviceName === serviceName ? { ...curr, result, percent: 100 } : curr));
      // Final refresh — once the script started the server, detection will pick it up.
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInstalling((curr) =>
        curr && curr.serviceName === serviceName
          ? { ...curr, result: { service: serviceName, success: false, exitCode: null, error: msg }, percent: 100 }
          : curr,
      );
    }
  };

  const dismissInstaller = () => setInstalling(null);

  const openSetup = async (id: string, serviceName: 'kokoro' | 'f5-tts' | 'sesame-csm') => {
    if (setupOpen === id) {
      setSetupOpen(null);
      setSetupInfo(null);
      return;
    }
    try {
      const info = (await window.aris.invoke('install:get-info', serviceName)) as ServiceInstallInfo;
      setSetupInfo(info);
      setSetupOpen(id);
    } catch {
      setSetupInfo(null);
    }
  };

  /**
   * GPU providers are gated when no compatible runtime is detected. Surface
   * this *visually* (greyed Activate button + tooltip) rather than blocking
   * — power users with non-standard setups should still be able to opt in.
   */
  const isGpuOk = (info: TTSProviderInfo): boolean => {
    if (info.hardwareClass !== 'gpu') return true;
    if (!gpu) return true; // no probe data — don't block
    if (!info.requirements?.needsGpuRuntime) return true;
    if (!gpu.hasGpu) return false;
    if (info.requirements.minVramMb && gpu.vramMb !== null) {
      return gpu.vramMb >= info.requirements.minVramMb;
    }
    return true;
  };

  return (
    <div style={containerStyle}>
      <h3 style={headingStyle}>TTS Provider</h3>
      {gpu && <GpuStatusBanner gpu={gpu} />}

      {KNOWN_PROVIDERS.map((known) => {
        const reg = registered.find((p) => p.id === known.id);
        const isActive = activeId === known.id;
        const ts = testStatus[known.id] ?? 'idle';
        const gpuOk = reg ? isGpuOk(reg) : known.hardwareClass !== 'gpu';

        return (
          <div key={known.id} style={cardStyle(isActive)}>
            <div style={cardHeaderStyle}>
              <div style={cardLeftStyle}>
                <span style={providerNameStyle}>{known.name}</span>
                <HardwareBadge hwClass={known.hardwareClass} />
                {known.badge && <span style={tierBadgeStyle}>{known.badge}</span>}
                {isActive && <span style={activePillStyle}>Active</span>}
              </div>
              <div style={cardRightStyle}>
                {reg ? (
                  <>
                    <button onClick={() => test(known.id)} style={chipBtnStyle(ts)}>
                      {ts === 'testing' ? 'Testing...' : ts === 'ok' ? 'Connected' : ts === 'fail' ? 'Failed' : 'Test'}
                    </button>
                    {isActive ? (
                      <button onClick={() => clearActive()} style={primaryBtnStyle}>Active</button>
                    ) : (
                      <button
                        onClick={() => activate(known.id)}
                        disabled={!gpuOk}
                        title={!gpuOk ? 'No compatible GPU runtime detected — see Setup for requirements' : undefined}
                        style={gpuOk ? activateBtnStyle : disabledBtnStyle}
                      >
                        Activate
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {installInfos[known.id]?.hasQuickInstall && (
                      <button
                        onClick={() => startQuickInstall(known.serviceName, known.name)}
                        style={quickInstallBtnStyle}
                      >
                        Quick Install
                      </button>
                    )}
                    <button onClick={() => openSetup(known.id, known.serviceName)} style={secondaryBtnStyle}>
                      {setupOpen === known.id ? 'Hide setup' : 'Manual setup'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <p style={cardDescStyle}>{known.description}</p>

            {setupOpen === known.id && setupInfo && (
              <SetupInstructions info={setupInfo} />
            )}
          </div>
        );
      })}

      {installing && (
        <QuickInstallModal
          state={installing}
          onDismiss={dismissInstaller}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function HardwareBadge({ hwClass }: { hwClass: 'cpu' | 'gpu' | 'cloud' }) {
  const label = hwClass.toUpperCase();
  const style = hwClass === 'gpu' ? gpuBadgeStyle : hwClass === 'cloud' ? cloudBadgeStyle : cpuBadgeStyle;
  return <span style={style}>{label}</span>;
}

function GpuStatusBanner({ gpu }: { gpu: GpuRuntime }) {
  const parts: string[] = [];
  if (gpu.hasGpu) {
    if (gpu.vendors.length) parts.push(gpu.vendors.map((v) => v.toUpperCase()).join(' + '));
    if (gpu.vramMb !== null) parts.push(`${(gpu.vramMb / 1024).toFixed(1)} GB VRAM`);
    if (gpu.cuda) parts.push('CUDA');
    if (gpu.metal) parts.push('Metal');
    if (gpu.rocm) parts.push('ROCm');
  }
  const summary = gpu.hasGpu ? `GPU detected — ${parts.join(' · ')}` : 'No GPU runtime detected';
  const tone = gpu.hasGpu ? 'ok' : 'warn';
  return (
    <div style={bannerStyle(tone)}>
      <span style={{ fontWeight: 600 }}>{summary}</span>
      {!gpu.hasGpu && (
        <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>
          GPU-class providers (Fish Speech) require CUDA, Metal, or ROCm.
        </span>
      )}
    </div>
  );
}

interface QuickInstallState {
  serviceName: ServiceName;
  displayName: string;
  percent: number;
  stage: string;
  message: string;
  log: string[];
  result: QuickInstallResult | null;
}

function QuickInstallModal({
  state,
  onDismiss,
}: {
  state: QuickInstallState;
  onDismiss: () => void;
}) {
  const inFlight = !state.result;
  const succeeded = state.result?.success === true;
  const failed = state.result && !state.result.success;
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log.length]);

  return (
    <div style={modalBackdropStyle}>
      <div style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={modalTitleStyle}>Installing {state.displayName}</h3>
          {!inFlight && (
            <button onClick={onDismiss} style={secondaryBtnStyle}>Close</button>
          )}
        </div>

        <div style={progressBarOuterStyle}>
          <div
            style={{
              ...progressBarInnerStyle,
              width: `${Math.max(0, Math.min(100, state.percent))}%`,
              background: failed ? 'var(--color-error)' : 'var(--color-primary)',
            }}
          />
        </div>
        <div style={modalStatusStyle}>
          <span>{state.message}</span>
          <span style={{ color: 'var(--text-muted)' }}>{state.percent}%</span>
        </div>

        {succeeded && (
          <p style={modalSuccessStyle}>
            ✓ Install complete. Aris should detect the server within a few seconds — refresh the page if needed.
          </p>
        )}
        {failed && state.result && (
          <p style={modalErrorStyle}>
            ✗ {state.result.error ?? 'Install failed.'} Check the log below or use Manual setup.
          </p>
        )}

        <pre ref={logRef} style={modalLogStyle}>
          {state.log.join('\n')}
        </pre>
      </div>
    </div>
  );
}

function SetupInstructions({ info }: { info: ServiceInstallInfo }) {
  return (
    <div style={setupBoxStyle}>
      <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{info.description}</p>
      <ol style={stepsListStyle}>
        {info.installSteps.map((step, i) => (
          <li key={i} style={stepItemStyle}>{step}</li>
        ))}
      </ol>
      {info.modelNote && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{info.modelNote}</p>
      )}
      <button
        onClick={() => window.open(info.downloadUrl, '_blank')}
        style={{ ...secondaryBtnStyle, marginTop: 8 }}
      >
        Open download page
      </button>
    </div>
  );
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  padding: 'var(--space-4)',
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-2)',
  fontSize: 'var(--text-md)',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

function cardStyle(active: boolean): React.CSSProperties {
  return {
    background: 'var(--bg-elevated)',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-3)',
    boxShadow: active ? 'var(--shadow-glow-sm)' : 'none',
  };
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
};

const cardLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const cardRightStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
};

const providerNameStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const cardDescStyle: React.CSSProperties = {
  margin: 'var(--space-2) 0 0',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
};

const cpuBadgeStyle: React.CSSProperties = {
  background: 'rgba(80,160,255,0.15)',
  color: '#5aa9ff',
  fontSize: '0.65rem',
  fontWeight: 700,
  borderRadius: 'var(--radius-full)',
  padding: '2px 8px',
  letterSpacing: '0.05em',
};

const gpuBadgeStyle: React.CSSProperties = {
  background: 'rgba(140,80,255,0.15)',
  color: '#b18bff',
  fontSize: '0.65rem',
  fontWeight: 700,
  borderRadius: 'var(--radius-full)',
  padding: '2px 8px',
  letterSpacing: '0.05em',
};

const cloudBadgeStyle: React.CSSProperties = {
  background: 'rgba(255,180,80,0.15)',
  color: '#ffb84d',
  fontSize: '0.65rem',
  fontWeight: 700,
  borderRadius: 'var(--radius-full)',
  padding: '2px 8px',
  letterSpacing: '0.05em',
};

const activePillStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  color: 'var(--color-primary)',
  fontSize: '0.65rem',
  fontWeight: 700,
  borderRadius: 'var(--radius-full)',
  padding: '2px 8px',
};

const tierBadgeStyle: React.CSSProperties = {
  background: 'rgba(255,180,80,0.12)',
  color: '#ffb84d',
  fontSize: '0.6rem',
  fontWeight: 700,
  borderRadius: 'var(--radius-full)',
  padding: '2px 6px',
  letterSpacing: '0.06em',
};

function chipBtnStyle(state: 'idle' | 'testing' | 'ok' | 'fail'): React.CSSProperties {
  const base: React.CSSProperties = {
    background: 'var(--bg-overlay)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-1) var(--space-2)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
  };
  if (state === 'ok') return { ...base, color: '#7be07b', borderColor: 'rgba(123,224,123,0.4)' };
  if (state === 'fail') return { ...base, color: 'var(--color-error)', borderColor: 'rgba(255,83,112,0.4)' };
  return base;
}

const activateBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary-subtle)',
  color: 'var(--color-primary)',
  border: '1px solid var(--color-primary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
};

const disabledBtnStyle: React.CSSProperties = {
  ...activateBtnStyle,
  background: 'var(--bg-overlay)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
};

function bannerStyle(tone: 'ok' | 'warn'): React.CSSProperties {
  return {
    background: tone === 'ok' ? 'rgba(123,224,123,0.08)' : 'rgba(255,180,0,0.08)',
    border: `1px solid ${tone === 'ok' ? 'rgba(123,224,123,0.3)' : 'rgba(255,180,0,0.3)'}`,
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-2) var(--space-3)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--space-2)',
  };
}

const setupBoxStyle: React.CSSProperties = {
  marginTop: 'var(--space-3)',
  padding: 'var(--space-3)',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
};

const stepsListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};

const stepItemStyle: React.CSSProperties = {
  marginBottom: 4,
};

const quickInstallBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 'var(--space-4)',
};

const modalCardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-4)',
  width: '100%',
  maxWidth: 640,
  maxHeight: '80vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  boxShadow: 'var(--shadow-lg)',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const modalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-md)',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const progressBarOuterStyle: React.CSSProperties = {
  width: '100%',
  height: 8,
  background: 'var(--bg-overlay)',
  borderRadius: 'var(--radius-full)',
  overflow: 'hidden',
};

const progressBarInnerStyle: React.CSSProperties = {
  height: '100%',
  transition: 'width 0.2s ease',
};

const modalStatusStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
};

const modalSuccessStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--space-2)',
  background: 'rgba(123,224,123,0.1)',
  border: '1px solid rgba(123,224,123,0.3)',
  color: '#7be07b',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-xs)',
};

const modalErrorStyle: React.CSSProperties = {
  margin: 0,
  padding: 'var(--space-2)',
  background: 'var(--color-error-bg)',
  border: '1px solid rgba(255,83,112,0.3)',
  color: 'var(--color-error)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-xs)',
};

const modalLogStyle: React.CSSProperties = {
  margin: 0,
  flex: 1,
  minHeight: 120,
  maxHeight: 300,
  overflow: 'auto',
  padding: 'var(--space-2)',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontSize: '0.7rem',
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  color: 'var(--text-muted)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
