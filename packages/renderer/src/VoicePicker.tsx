import { useState, useEffect, useRef } from 'react';

interface KokoroVoice {
  id: string;
  name: string;
  language: string;
  gender: string;
  style: string;
}

const KOKORO_VOICES: KokoroVoice[] = [
  { id: 'af', name: 'Default', language: 'English (US)', gender: 'Female', style: 'Neutral' },
  { id: 'af_bella', name: 'Bella', language: 'English (US)', gender: 'Female', style: 'Warm' },
  { id: 'af_nicole', name: 'Nicole', language: 'English (US)', gender: 'Female', style: 'Soft' },
  { id: 'af_sarah', name: 'Sarah', language: 'English (US)', gender: 'Female', style: 'Natural' },
  { id: 'af_sky', name: 'Sky', language: 'English (US)', gender: 'Female', style: 'Bright' },
  { id: 'am_adam', name: 'Adam', language: 'English (US)', gender: 'Male', style: 'Deep' },
  { id: 'am_michael', name: 'Michael', language: 'English (US)', gender: 'Male', style: 'Neutral' },
  { id: 'bf_emma', name: 'Emma', language: 'English (UK)', gender: 'Female', style: 'Crisp' },
  { id: 'bf_isabella', name: 'Isabella', language: 'English (UK)', gender: 'Female', style: 'Refined' },
  { id: 'bm_george', name: 'George', language: 'English (UK)', gender: 'Male', style: 'Authoritative' },
  { id: 'bm_lewis', name: 'Lewis', language: 'English (UK)', gender: 'Male', style: 'Calm' },
];

const PREVIEW_TEXT = 'Hello! This is a preview of how I sound.';

interface Props {
  kokoroEndpoint: string | null;
  selectedVoice: string | null;
  onSelect: (voiceId: string | null) => void;
}

export function VoicePicker({ kokoroEndpoint, selectedVoice, onSelect }: Props) {
  const [voices, setVoices] = useState<KokoroVoice[]>(KOKORO_VOICES);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!kokoroEndpoint) return;

    // Try to fetch voices from the Kokoro API; fall back to hardcoded list on error
    fetch(`${kokoroEndpoint}/v1/voices`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data) || data.length === 0) return;
        // Map API voice IDs back to our metadata, keeping known entries first
        const apiIds = data as string[];
        const merged: KokoroVoice[] = apiIds.map((id) => {
          const known = KOKORO_VOICES.find((v) => v.id === id);
          if (known) return known;
          // Unknown voice — use the ID as the name
          return { id, name: id, language: 'Unknown', gender: 'Unknown', style: 'Unknown' };
        });
        setVoices(merged);
      })
      .catch(() => {
        // Keep hardcoded list
      });
  }, [kokoroEndpoint]);

  const stopCurrentPreview = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
  };

  const handlePreview = async (voiceId: string) => {
    if (!kokoroEndpoint) return;
    if (previewingVoice === voiceId) {
      stopCurrentPreview();
      setPreviewingVoice(null);
      return;
    }

    stopCurrentPreview();
    setPreviewingVoice(voiceId);
    setPreviewError(null);

    try {
      const response = await fetch(`${kokoroEndpoint}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: PREVIEW_TEXT,
          voice: voiceId,
          response_format: 'mp3',
          speed: 1.0,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      currentBlobUrlRef.current = url;

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        currentBlobUrlRef.current = null;
        currentAudioRef.current = null;
        setPreviewingVoice(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        currentBlobUrlRef.current = null;
        currentAudioRef.current = null;
        setPreviewingVoice(null);
        setPreviewError('Playback failed.');
      };

      await audio.play();
    } catch {
      setPreviewingVoice(null);
      setPreviewError('Preview failed — check that Kokoro is running.');
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCurrentPreview();
    };
  }, []);

  return (
    <div style={containerStyle}>
      {!kokoroEndpoint && (
        <div style={bannerStyle}>
          <span style={bannerIconStyle}>ℹ</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Kokoro TTS is not running — voice previews unavailable. You can still select a voice;
            it will be used when Kokoro starts.
          </span>
        </div>
      )}

      <div style={listStyle}>
        {voices.map((voice) => {
          const isSelected = selectedVoice === voice.id;
          const isPreviewing = previewingVoice === voice.id;

          return (
            <div
              key={voice.id}
              onClick={() => onSelect(voice.id)}
              style={rowStyle(isSelected)}
            >
              {/* Radio indicator */}
              <div style={radioStyle(isSelected)}>
                {isSelected && <div style={radioDotStyle} />}
              </div>

              {/* Voice info */}
              <div style={infoStyle}>
                <span style={nameStyle}>{voice.name}</span>
                <div style={tagsStyle}>
                  <span style={tagStyle}>{voice.language}</span>
                  <span style={tagStyle}>{voice.gender}</span>
                  <span style={tagStyle}>{voice.style}</span>
                </div>
              </div>

              {/* Preview button */}
              {kokoroEndpoint && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handlePreview(voice.id);
                  }}
                  style={previewBtnStyle(isPreviewing)}
                  title={isPreviewing ? 'Stop preview' : 'Preview voice'}
                >
                  {isPreviewing ? '■' : '▶'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {previewError && (
        <p style={errorStyle}>{previewError}</p>
      )}

      {selectedVoice && (
        <div style={clearRowStyle}>
          <button onClick={() => onSelect(null)} style={clearBtnStyle}>
            Clear selection (use system default)
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
};

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-2) var(--space-3)',
};

const bannerIconStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)',
  color: 'var(--text-muted)',
  flexShrink: 0,
  lineHeight: 1.4,
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  maxHeight: 320,
  overflowY: 'auto',
};

function rowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-3)',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    background: selected ? 'var(--color-primary-subtle)' : 'transparent',
    border: `1px solid ${selected ? 'var(--color-primary)' : 'transparent'}`,
    transition: 'var(--transition-fast)',
  };
}

function radioStyle(selected: boolean): React.CSSProperties {
  return {
    width: 16,
    height: 16,
    borderRadius: '50%',
    border: `2px solid ${selected ? 'var(--color-primary)' : 'var(--border-default)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'var(--transition-fast)',
  };
}

const radioDotStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--color-primary)',
};

const infoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const nameStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-medium)' as React.CSSProperties['fontWeight'],
  color: 'var(--text-primary)',
};

const tagsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  flexWrap: 'wrap',
};

const tagStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--text-muted)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-full)',
  padding: '1px 6px',
};

function previewBtnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-primary-subtle)' : 'var(--bg-elevated)',
    color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    flexShrink: 0,
    transition: 'var(--transition-fast)',
  };
}

const errorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
};

const clearRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
};

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textDecoration: 'underline',
};
