import { useState, useEffect, useCallback } from 'react';
import type { CaptureSource, CaptureStatus } from '@aris/shared';

export function CapturePanel() {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      const srcs = (await window.aris.invoke('vision:get-sources')) as CaptureSource[] | undefined;
      setSources(srcs ?? []);
    } catch {
      setSources([]);
    }
    setLoading(false);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = (await window.aris.invoke('vision:get-status')) as CaptureStatus;
      setStatus(s);
      if (s.sourceId) setSelectedSource(s.sourceId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSources();
    loadStatus();
  }, [loadSources, loadStatus]);

  // Listen for frame events to keep status updated
  useEffect(() => {
    const cleanup = window.aris.on('vision:frame', (data: unknown) => {
      const frame = data as { detectedGame?: string; fps: number; frameCount: number };
      setStatus((prev) =>
        prev
          ? { ...prev, detectedGame: frame.detectedGame, fps: frame.fps, frameCount: frame.frameCount }
          : null,
      );
    });
    return cleanup;
  }, []);

  const startCapture = async () => {
    if (!selectedSource) return;
    try {
      await window.aris.invoke('vision:start-capture', {
        sourceId: selectedSource,
        fps: 2,
        maxWidth: 1280,
        maxHeight: 720,
        jpegQuality: 70,
      });
      await loadStatus();
    } catch {
      // ignore
    }
  };

  const stopCapture = async () => {
    await window.aris.invoke('vision:stop-capture');
    await loadStatus();
  };

  const analyzeFrame = async () => {
    try {
      await window.aris.invoke('vision:analyze-frame', 'Describe what you see in this screenshot.');
    } catch {
      // ignore
    }
  };

  const isActive = status?.active ?? false;

  return (
    <div style={sectionStyle}>
      <h3 style={headingStyle}>Screen Capture</h3>

      <div style={rowStyle}>
        <span>Status</span>
        <span style={{ color: isActive ? '#4ade80' : '#888', fontSize: '0.85rem', fontWeight: 600 }}>
          {isActive ? 'Capturing' : 'Idle'}
        </span>
      </div>

      {isActive && status && (
        <div style={statsStyle}>
          {status.detectedGame && (
            <span>Game: <strong>{status.detectedGame}</strong></span>
          )}
          <span>Frames: {status.frameCount}</span>
          <span>FPS: {status.fps}</span>
        </div>
      )}

      <div style={{ margin: '0.75rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#aaa' }}>Source</span>
          <button onClick={loadSources} disabled={loading} style={refreshBtnStyle}>
            {loading ? '...' : 'Refresh'}
          </button>
        </div>

        <div style={sourceListStyle}>
          {sources.length === 0 && !loading && (
            <p style={{ color: '#666', fontSize: '0.8rem', margin: '0.5rem 0' }}>
              No sources found. Click Refresh.
            </p>
          )}
          {sources.map((src) => (
            <button
              key={src.id}
              onClick={() => setSelectedSource(src.id)}
              style={{
                ...sourceItemStyle,
                borderColor: selectedSource === src.id ? '#2563eb' : '#444',
              }}
            >
              {src.thumbnailDataUrl && (
                <img
                  src={src.thumbnailDataUrl}
                  alt={src.name}
                  style={{ width: 80, height: 50, objectFit: 'cover', borderRadius: 3 }}
                />
              )}
              <span style={{ fontSize: '0.75rem', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {src.isScreen ? '🖥 ' : '🪟 '}{src.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {!isActive ? (
          <button onClick={startCapture} disabled={!selectedSource} style={actionBtnStyle}>
            Start Capture
          </button>
        ) : (
          <>
            <button onClick={stopCapture} style={{ ...actionBtnStyle, background: '#522', color: '#e88' }}>
              Stop Capture
            </button>
            <button onClick={analyzeFrame} style={actionBtnStyle}>
              Analyze Frame
            </button>
          </>
        )}
      </div>

      <p style={hintStyle}>
        Captures your screen or a window at low FPS for AI-assisted gameplay analysis.
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

const statsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  fontSize: '0.8rem',
  color: '#aaa',
  padding: '0.25rem 0',
};

const sourceListStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  overflowX: 'auto',
  paddingBottom: '0.25rem',
};

const sourceItemStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '2px solid #444',
  borderRadius: '6px',
  padding: '0.35rem',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: '0.25rem',
  minWidth: 100,
  maxWidth: 120,
};

const actionBtnStyle: React.CSSProperties = {
  background: '#333',
  color: '#eee',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '0.3rem 0.7rem',
  cursor: 'pointer',
  fontSize: '0.8rem',
};

const refreshBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #444',
  color: '#888',
  borderRadius: '4px',
  padding: '0.15rem 0.4rem',
  cursor: 'pointer',
  fontSize: '0.7rem',
};

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666',
  margin: '0.5rem 0 0',
};
