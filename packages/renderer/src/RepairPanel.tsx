import { useState, useEffect, useCallback } from 'react';
import type { ServiceDetectionResult, ServiceInstallInfo, ServiceName } from '@aris/shared';

type ScanState = 'scanning' | 'done';

const SERVICE_DISPLAY: Record<ServiceName, { label: string; role: string }> = {
  lmstudio: { label: 'LM Studio', role: 'AI provider (local models)' },
  ollama: { label: 'Ollama', role: 'AI provider (local models)' },
  kokoro: { label: 'Kokoro TTS', role: 'Text-to-speech voice' },
  whisper: { label: 'Whisper STT', role: 'Speech-to-text recognition' },
};

export function RepairPanel() {
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [baseline, setBaseline] = useState<ServiceDetectionResult[] | null>(null);
  const [current, setCurrent] = useState<ServiceDetectionResult[] | null>(null);
  const [installInfos, setInstallInfos] = useState<Partial<Record<ServiceName, ServiceInstallInfo>>>({});
  const [expandedService, setExpandedService] = useState<ServiceName | null>(null);
  const [openingDownload, setOpeningDownload] = useState<ServiceName | null>(null);
  const [verifying, setVerifying] = useState<ServiceName | null>(null);

  const runScan = useCallback(async (isBaseline: boolean) => {
    setScanState('scanning');
    try {
      const results = (await window.aris.invoke('services:detect-all')) as ServiceDetectionResult[];
      setCurrent(results);
      if (isBaseline) setBaseline(results);
    } catch {
      // ignore
    }
    setScanState('done');
  }, []);

  useEffect(() => {
    void runScan(true);
  }, [runScan]);

  const loadInstallInfo = async (name: ServiceName) => {
    if (installInfos[name]) return;
    try {
      const info = (await window.aris.invoke('install:get-info', name)) as ServiceInstallInfo;
      setInstallInfos((prev) => ({ ...prev, [name]: info }));
    } catch {
      // ignore
    }
  };

  const toggleExpand = async (name: ServiceName) => {
    if (expandedService === name) {
      setExpandedService(null);
    } else {
      setExpandedService(name);
      await loadInstallInfo(name);
    }
  };

  const openDownload = async (name: ServiceName) => {
    setOpeningDownload(name);
    try {
      await window.aris.invoke('install:open-download', name);
    } catch {
      // ignore
    }
    setOpeningDownload(null);
  };

  const verifyService = async (name: ServiceName) => {
    setVerifying(name);
    try {
      const result = (await window.aris.invoke('install:verify', name)) as ServiceDetectionResult;
      setCurrent((prev) => prev?.map((r) => (r.name === name ? result : r)) ?? [result]);
    } catch {
      // ignore
    }
    setVerifying(null);
  };

  const allHealthy = current !== null && current.every((r) => r.running);

  return (
    <div style={panelStyle}>
      <div style={headerRowStyle}>
        <div>
          <div style={sectionHeadingStyle}>Service Health</div>
          <p style={descStyle}>Check and repair local AI services used by Aris.</p>
        </div>
        <button
          onClick={() => void runScan(false)}
          disabled={scanState === 'scanning'}
          style={secondaryBtnStyle}
          data-testid="repair-rescan"
        >
          {scanState === 'scanning' ? 'Scanning…' : 'Re-check all'}
        </button>
      </div>

      {scanState === 'scanning' && !current && (
        <div style={emptyStateStyle} data-testid="repair-scanning">
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Scanning services…</span>
        </div>
      )}

      {current?.map((result) => {
        const { name, running, installed } = result;
        const display = SERVICE_DISPLAY[name];
        const expanded = expandedService === name;
        const installInfo = installInfos[name];
        const baseResult = baseline?.find((r) => r.name === name);
        const degraded = (baseResult?.running ?? false) && !running;
        const improved = baseline !== null && !(baseResult?.running ?? false) && running;

        return (
          <div key={name} style={serviceCardStyle(running)} data-testid={`service-card-${name}`}>
            <div style={serviceRowStyle}>
              <div style={{ flex: 1 }}>
                <div style={serviceLabelStyle}>{display.label}</div>
                <div style={serviceRoleStyle}>{display.role}</div>
                {degraded && (
                  <div style={warnNoteStyle}>Was running at startup — may have stopped</div>
                )}
              </div>
              <div style={statusColStyle}>
                <ServiceStatusBadge running={running} installed={installed} improved={improved} />
                {!running && (
                  <button
                    onClick={() => void toggleExpand(name)}
                    style={fixBtnStyle}
                    data-testid={`fix-btn-${name}`}
                  >
                    {expanded ? 'Hide' : 'Fix'}
                  </button>
                )}
                {running && (
                  <button
                    onClick={() => void verifyService(name)}
                    disabled={verifying === name}
                    style={verifyBtnStyle}
                    data-testid={`verify-btn-${name}`}
                  >
                    {verifying === name ? '…' : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            {expanded && (
              <div style={fixPanelStyle} data-testid={`fix-panel-${name}`}>
                <div style={dividerStyle} />
                {!installInfo ? (
                  <p style={loadingStyle}>Loading install guide…</p>
                ) : (
                  <>
                    <p style={installDescStyle}>{installInfo.description}</p>
                    <ol style={stepsListStyle}>
                      {installInfo.installSteps.map((step, i) => (
                        <li key={i} style={stepItemStyle}>{step}</li>
                      ))}
                    </ol>
                    {installInfo.modelNote && (
                      <div style={modelNoteStyle}>{installInfo.modelNote}</div>
                    )}
                    <div style={fixActionsStyle}>
                      <button
                        onClick={() => void openDownload(name)}
                        disabled={openingDownload === name}
                        style={primaryBtnStyle}
                        data-testid={`open-download-${name}`}
                      >
                        {openingDownload === name ? 'Opening…' : `Download ${installInfo.displayName}`}
                      </button>
                      <button
                        onClick={() => void verifyService(name)}
                        disabled={verifying === name}
                        style={secondaryBtnStyle}
                        data-testid={`check-again-${name}`}
                      >
                        {verifying === name ? 'Checking…' : 'Check again'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {scanState === 'done' && allHealthy && (
        <div style={allClearStyle} data-testid="all-clear">
          All services are running.
        </div>
      )}
    </div>
  );
}

function ServiceStatusBadge({
  running,
  installed,
  improved,
}: {
  running: boolean;
  installed: boolean;
  improved: boolean;
}) {
  if (improved) return <span style={badge('ok')}>Fixed ✓</span>;
  if (running) return <span style={badge('ok')}>Running ✓</span>;
  if (installed) return <span style={badge('warn')}>Not running</span>;
  return <span style={badge('missing')}>Not detected</span>;
}

/* ── Styles ── */

const panelStyle: React.CSSProperties = { padding: 'var(--space-4)' };

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 'var(--space-4)',
  gap: 'var(--space-4)',
};

const sectionHeadingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-1)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 0,
  lineHeight: 'var(--leading-normal)',
};

const emptyStateStyle: React.CSSProperties = {
  padding: 'var(--space-6) 0',
  textAlign: 'center',
};

function serviceCardStyle(running: boolean): React.CSSProperties {
  return {
    background: running ? 'var(--bg-elevated)' : 'rgba(255,83,112,0.04)',
    border: `1px solid ${running ? 'var(--border-subtle)' : 'rgba(255,83,112,0.2)'}`,
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-2)',
    overflow: 'hidden',
  };
}

const serviceRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: 'var(--space-3)',
  gap: 'var(--space-3)',
};

const serviceLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as any,
  color: 'var(--text-primary)',
};

const serviceRoleStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginTop: 2,
};

const warnNoteStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'rgba(255,180,0,0.9)',
  marginTop: 2,
};

const statusColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 'var(--space-1)',
  flexShrink: 0,
};

function badge(status: 'ok' | 'warn' | 'missing'): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    ok: { bg: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' },
    warn: { bg: 'rgba(255,180,0,0.12)', color: 'rgba(255,180,0,0.9)' },
    missing: { bg: 'rgba(255,83,112,0.12)', color: 'var(--color-error)' },
  };
  const { bg, color } = map[status];
  return {
    display: 'inline-block',
    background: bg,
    color,
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)' as any,
    borderRadius: 'var(--radius-full)',
    padding: '2px 8px',
    whiteSpace: 'nowrap',
  };
}

const fixBtnStyle: React.CSSProperties = {
  background: 'var(--color-error-bg)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.3)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const verifyBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const fixPanelStyle: React.CSSProperties = {
  padding: '0 var(--space-3) var(--space-3)',
};

const dividerStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-subtle)',
  margin: '0 0 var(--space-3)',
};

const loadingStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 0,
};

const installDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  margin: '0 0 var(--space-2)',
};

const stepsListStyle: React.CSSProperties = {
  margin: '0 0 var(--space-2)',
  paddingLeft: 'var(--space-4)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
};

const stepItemStyle: React.CSSProperties = {
  marginBottom: 'var(--space-1)',
  lineHeight: 'var(--leading-normal)',
};

const modelNoteStyle: React.CSSProperties = {
  background: 'rgba(255,180,0,0.08)',
  border: '1px solid rgba(255,180,0,0.2)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-xs)',
  color: 'rgba(255,180,0,0.9)',
  marginBottom: 'var(--space-3)',
};

const fixActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-3)',
  flexWrap: 'wrap',
};

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as any,
  transition: 'var(--transition-fast)',
  whiteSpace: 'nowrap',
};

const allClearStyle: React.CSSProperties = {
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.25)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  fontSize: 'var(--text-sm)',
  color: 'rgb(34,197,94)',
  textAlign: 'center',
  marginTop: 'var(--space-2)',
};
