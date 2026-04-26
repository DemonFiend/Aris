import { useState, useEffect, useCallback } from 'react';
import type { GpuRuntime, ServiceInstallInfo } from '@aris/shared';

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
  serviceName: 'kokoro' | 'f5-tts';
  description: string;
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
];

export function TTSProviderSettings() {
  const [registered, setRegistered] = useState<TTSProviderInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [gpu, setGpu] = useState<GpuRuntime | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});
  const [setupOpen, setSetupOpen] = useState<string | null>(null);
  const [setupInfo, setSetupInfo] = useState<ServiceInstallInfo | null>(null);

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
    })();
  }, [refresh]);

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

  const openSetup = async (id: string, serviceName: 'kokoro' | 'f5-tts') => {
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
                  <button onClick={() => openSetup(known.id, known.serviceName)} style={secondaryBtnStyle}>
                    {setupOpen === known.id ? 'Hide setup' : 'Setup'}
                  </button>
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
