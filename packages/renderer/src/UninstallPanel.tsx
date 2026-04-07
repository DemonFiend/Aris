import { useState, useEffect, useCallback } from 'react';
import type {
  UninstallTarget,
  UninstallTargetId,
  UninstallResult,
  UninstallProgress,
} from '@aris/shared';

type FlowStep = 'select' | 'confirm' | 'executing' | 'done';

export function UninstallPanel() {
  const [step, setStep] = useState<FlowStep>('select');
  const [scanning, setScanning] = useState(true);
  const [targets, setTargets] = useState<UninstallTarget[]>([]);
  const [selected, setSelected] = useState<Set<UninstallTargetId>>(new Set());
  const [progress, setProgress] = useState<Map<UninstallTargetId, UninstallProgress>>(new Map());
  const [results, setResults] = useState<UninstallResult[]>([]);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const t = (await window.aris.invoke('uninstall:scan')) as UninstallTarget[];
      setTargets(t);
      // Pre-select only installed items
      setSelected(new Set(t.filter((x) => x.isInstalled).map((x) => x.id)));
    } catch {
      // ignore
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  // Listen for progress events from main process
  useEffect(() => {
    const unsub = window.aris.on('uninstall:progress', (raw) => {
      const p = raw as UninstallProgress;
      setProgress((prev) => new Map(prev).set(p.id, p));
    });
    return unsub;
  }, []);

  const toggleSelect = (id: UninstallTargetId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    setStep('confirm');
  };

  const handleExecute = async () => {
    setStep('executing');
    const ids = [...selected];

    // Seed progress map with pending state for all selected
    const initial = new Map<UninstallTargetId, UninstallProgress>();
    for (const id of ids) {
      const target = targets.find((t) => t.id === id);
      if (target) {
        initial.set(id, { id, displayName: target.displayName, status: 'pending' });
      }
    }
    setProgress(initial);

    try {
      const r = (await window.aris.invoke('uninstall:execute', ids)) as UninstallResult[];
      setResults(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResults(
        ids.map((id) => ({
          id,
          status: 'failed' as const,
          message: msg,
        })),
      );
    }

    setStep('done');
  };

  const handleReset = () => {
    setStep('select');
    setSelected(new Set());
    setProgress(new Map());
    setResults([]);
    void scan();
  };

  if (scanning && targets.length === 0) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={headingStyle}>Uninstall Components</div>
          <p style={descStyle}>Remove services and data managed by Aris.</p>
        </div>
        <div style={emptyStyle} data-testid="uninstall-scanning">
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Scanning for installed components…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle} data-testid="uninstall-panel">
      <div style={headerStyle}>
        <div style={headingStyle}>Uninstall Components</div>
        <p style={descStyle}>Remove services and data managed by Aris.</p>
      </div>

      {step === 'select' && (
        <SelectStep
          targets={targets}
          selected={selected}
          onToggle={toggleSelect}
          onNext={handleConfirm}
        />
      )}

      {step === 'confirm' && (
        <ConfirmStep
          targets={targets.filter((t) => selected.has(t.id))}
          onBack={() => setStep('select')}
          onConfirm={() => void handleExecute()}
        />
      )}

      {step === 'executing' && (
        <ExecuteStep
          targets={targets.filter((t) => selected.has(t.id))}
          progress={progress}
        />
      )}

      {step === 'done' && (
        <DoneStep
          results={results}
          targets={targets}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function SelectStep({
  targets,
  selected,
  onToggle,
  onNext,
}: {
  targets: UninstallTarget[];
  selected: Set<UninstallTargetId>;
  onToggle: (id: UninstallTargetId) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        {targets.map((target) => (
          <label
            key={target.id}
            style={checkRowStyle(selected.has(target.id))}
            data-testid={`uninstall-target-${target.id}`}
          >
            <input
              type="checkbox"
              checked={selected.has(target.id)}
              onChange={() => onToggle(target.id)}
              disabled={!target.isInstalled}
              style={checkboxStyle}
              data-testid={`uninstall-check-${target.id}`}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={targetLabelStyle}>
                {target.displayName}
                {!target.isInstalled && (
                  <span style={notDetectedBadge}>Not detected</span>
                )}
              </div>
              <div style={targetDescStyle}>{target.description}</div>
              {target.detectedPath && target.isInstalled && (
                <div style={pathStyle}>{target.detectedPath}</div>
              )}
            </div>
            {target.id === 'aris-data' && (
              <span style={warningBadge}>Irreversible</span>
            )}
          </label>
        ))}
      </div>

      <div style={actionsRowStyle}>
        <button
          onClick={onNext}
          disabled={selected.size === 0}
          style={selected.size > 0 ? dangerBtnStyle : disabledBtnStyle}
          data-testid="uninstall-next"
        >
          Continue ({selected.size} selected)
        </button>
      </div>
    </div>
  );
}

function ConfirmStep({
  targets,
  onBack,
  onConfirm,
}: {
  targets: UninstallTarget[];
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div data-testid="uninstall-confirm">
      <div style={warningBoxStyle}>
        <div style={warningTitleStyle}>This action cannot be undone</div>
        <p style={warningTextStyle}>
          The following components will be permanently removed from your system:
        </p>
        <ul style={confirmListStyle}>
          {targets.map((t) => (
            <li key={t.id} style={confirmItemStyle}>
              <strong>{t.displayName}</strong>
              {t.detectedPath && (
                <span style={pathStyle}> — {t.detectedPath}</span>
              )}
            </li>
          ))}
        </ul>
        {targets.some((t) => t.id === 'aris-data') && (
          <p style={warningTextStyle}>
            Removing Aris Data will delete all your conversations, settings, and game profiles.
          </p>
        )}
      </div>

      <div style={actionsRowStyle}>
        <button onClick={onBack} style={secondaryBtnStyle} data-testid="uninstall-back">
          Back
        </button>
        <button onClick={onConfirm} style={dangerBtnStyle} data-testid="uninstall-confirm-btn">
          Remove {targets.length} component{targets.length !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

function ExecuteStep({
  targets,
  progress,
}: {
  targets: UninstallTarget[];
  progress: Map<UninstallTargetId, UninstallProgress>;
}) {
  return (
    <div data-testid="uninstall-executing">
      <p style={execDescStyle}>Removing components…</p>
      <div>
        {targets.map((target) => {
          const p = progress.get(target.id);
          const status = p?.status ?? 'pending';
          return (
            <div key={target.id} style={progressRowStyle} data-testid={`uninstall-progress-${target.id}`}>
              <span style={progressIconStyle(status)}>{statusIcon(status)}</span>
              <div style={{ flex: 1 }}>
                <div style={progressLabelStyle}>{target.displayName}</div>
                {p?.message && <div style={progressMsgStyle}>{p.message}</div>}
              </div>
              <span style={progressBadgeStyle(status)}>{statusLabel(status)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoneStep({
  results,
  targets,
  onReset,
}: {
  results: UninstallResult[];
  targets: UninstallTarget[];
  onReset: () => void;
}) {
  const removed = results.filter((r) => r.status === 'removed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return (
    <div data-testid="uninstall-done">
      <div style={failed > 0 ? partialBoxStyle : successBoxStyle}>
        <div style={doneHeadingStyle}>
          {failed > 0 ? `Done — ${failed} error${failed !== 1 ? 's' : ''}` : 'Done'}
        </div>
        <p style={doneDescStyle}>
          {removed} component{removed !== 1 ? 's' : ''} removed.
          {failed > 0 && ` ${failed} failed.`}
        </p>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        {results.map((result) => {
          const target = targets.find((t) => t.id === result.id);
          return (
            <div key={result.id} style={progressRowStyle} data-testid={`uninstall-result-${result.id}`}>
              <span style={progressIconStyle(result.status === 'failed' ? 'failed' : 'done')}>
                {result.status === 'failed' ? '✗' : '✓'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={progressLabelStyle}>{target?.displayName ?? result.id}</div>
                <div style={progressMsgStyle}>{result.message}</div>
              </div>
              <span style={resultBadgeStyle(result.status)}>{result.status}</span>
            </div>
          );
        })}
      </div>

      <div style={actionsRowStyle}>
        <button onClick={onReset} style={secondaryBtnStyle} data-testid="uninstall-reset">
          Back to selection
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIcon(status: UninstallProgress['status']): string {
  switch (status) {
    case 'pending': return '○';
    case 'removing': return '…';
    case 'done': return '✓';
    case 'failed': return '✗';
  }
}

function statusLabel(status: UninstallProgress['status']): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'removing': return 'Removing…';
    case 'done': return 'Done';
    case 'failed': return 'Failed';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = { padding: 'var(--space-4)' };

const headerStyle: React.CSSProperties = { marginBottom: 'var(--space-4)' };

const headingStyle: React.CSSProperties = {
  margin: '0 0 var(--space-1)',
  fontSize: 'var(--text-md)',
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
  color: 'var(--text-primary)',
};

const descStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  margin: 0,
  lineHeight: 'var(--leading-normal)',
};

const emptyStyle: React.CSSProperties = {
  padding: 'var(--space-6) 0',
  textAlign: 'center',
};

function checkRowStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-3)',
    marginBottom: 'var(--space-2)',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${checked ? 'rgba(255,83,112,0.35)' : 'var(--border-subtle)'}`,
    background: checked ? 'rgba(255,83,112,0.04)' : 'var(--bg-elevated)',
    cursor: 'pointer',
    userSelect: 'none',
  };
}

const checkboxStyle: React.CSSProperties = {
  marginTop: 2,
  flexShrink: 0,
  accentColor: 'var(--color-error)',
};

const targetLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const targetDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  marginTop: 2,
};

const pathStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontFamily: 'monospace',
  marginTop: 2,
  wordBreak: 'break-all',
};

const notDetectedBadge: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  background: 'var(--bg-base)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-full)',
  padding: '1px 6px',
  fontWeight: 'var(--font-normal)' as React.CSSProperties['fontWeight'],
};

const warningBadge: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
  background: 'rgba(255,83,112,0.12)',
  color: 'var(--color-error)',
  border: '1px solid rgba(255,83,112,0.25)',
  borderRadius: 'var(--radius-full)',
  padding: '2px 8px',
  alignSelf: 'flex-start',
  whiteSpace: 'nowrap',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--space-2)',
  marginTop: 'var(--space-3)',
};

const dangerBtnStyle: React.CSSProperties = {
  background: 'var(--color-error)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
};

const disabledBtnStyle: React.CSSProperties = {
  ...dangerBtnStyle,
  background: 'var(--border-default)',
  color: 'var(--text-muted)',
  cursor: 'not-allowed',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-4)',
  cursor: 'pointer',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
};

const warningBoxStyle: React.CSSProperties = {
  background: 'rgba(255,83,112,0.06)',
  border: '1px solid rgba(255,83,112,0.25)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-3)',
};

const warningTitleStyle: React.CSSProperties = {
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
  color: 'var(--color-error)',
  fontSize: 'var(--text-sm)',
  marginBottom: 'var(--space-1)',
};

const warningTextStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  margin: '0 0 var(--space-2)',
};

const confirmListStyle: React.CSSProperties = {
  margin: '0 0 var(--space-2)',
  paddingLeft: 'var(--space-4)',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
};

const confirmItemStyle: React.CSSProperties = {
  marginBottom: 'var(--space-1)',
};

const execDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-muted)',
  marginBottom: 'var(--space-3)',
};

const progressRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-3)',
  marginBottom: 'var(--space-1)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
};

function progressIconStyle(status: string): React.CSSProperties {
  const color =
    status === 'done' ? 'rgb(34,197,94)' :
    status === 'failed' ? 'var(--color-error)' :
    status === 'removing' ? 'rgba(255,180,0,0.9)' :
    'var(--text-muted)';
  return { color, flexShrink: 0, marginTop: 1, fontFamily: 'monospace' };
}

const progressLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
};

const progressMsgStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  wordBreak: 'break-all',
};

function progressBadgeStyle(status: UninstallProgress['status']): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: 'var(--bg-base)', color: 'var(--text-muted)' },
    removing: { bg: 'rgba(255,180,0,0.12)', color: 'rgba(255,180,0,0.9)' },
    done: { bg: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' },
    failed: { bg: 'rgba(255,83,112,0.12)', color: 'var(--color-error)' },
  };
  const { bg, color } = map[status] ?? map.pending;
  return {
    flexShrink: 0,
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
    background: bg,
    color,
    borderRadius: 'var(--radius-full)',
    padding: '2px 8px',
    whiteSpace: 'nowrap',
    alignSelf: 'flex-start',
  };
}

function resultBadgeStyle(status: UninstallResult['status']): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    removed: { bg: 'rgba(34,197,94,0.12)', color: 'rgb(34,197,94)' },
    skipped: { bg: 'var(--bg-base)', color: 'var(--text-muted)' },
    failed: { bg: 'rgba(255,83,112,0.12)', color: 'var(--color-error)' },
    'not-found': { bg: 'rgba(255,180,0,0.12)', color: 'rgba(255,180,0,0.9)' },
  };
  const { bg, color } = map[status] ?? map.skipped;
  return {
    flexShrink: 0,
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
    background: bg,
    color,
    borderRadius: 'var(--radius-full)',
    padding: '2px 8px',
    whiteSpace: 'nowrap',
    alignSelf: 'flex-start',
  };
}

const successBoxStyle: React.CSSProperties = {
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.25)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-3)',
};

const partialBoxStyle: React.CSSProperties = {
  background: 'rgba(255,180,0,0.08)',
  border: '1px solid rgba(255,180,0,0.25)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3) var(--space-4)',
  marginBottom: 'var(--space-3)',
};

const doneHeadingStyle: React.CSSProperties = {
  fontWeight: 'var(--font-semibold)' as React.CSSProperties['fontWeight'],
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-1)',
};

const doneDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  margin: 0,
};
