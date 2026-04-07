import { useState, useEffect, useRef, useCallback } from 'react';
import type { VoiceConfig } from '@aris/shared';

interface Props {
  onTranscript: (text: string) => void;
}

export function VoiceControls({ onTranscript }: Props) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<VoiceConfig | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef(globalThis.speechSynthesis);

  useEffect(() => {
    (async () => {
      const cfg = (await window.aris.invoke('voice:get-config')) as VoiceConfig;
      setConfig(cfg);
    })();
  }, []);

  useEffect(() => {
    const cleanup = window.aris.on('voice:command', (command: unknown, ...args: unknown[]) => {
      switch (command) {
        case 'start-listening':
          startListening();
          break;
        case 'stop-listening':
          stopListening();
          break;
        case 'speak':
          if (typeof args[0] === 'string') speak(args[0]);
          break;
        case 'stop-speaking':
          stopSpeaking();
          break;
      }
    });

    const pttCleanup = window.aris.on('voice:push-to-talk', () => {
      if (listening) {
        stopListening();
      } else {
        startListening();
      }
    });

    return () => {
      cleanup();
      pttCleanup();
    };
  }, [listening]);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition not available');
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = config?.language ?? 'en-US';

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          setInterim('');
          onTranscript(result[0].transcript.trim());
        } else {
          setInterim(result[0].transcript);
        }
      }
    };

    rec.onerror = (event: any) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError(event.error);
        setListening(false);
      }
    };

    rec.onend = () => {
      if (recognitionRef.current === rec) {
        try {
          rec.start();
        } catch {
          setListening(false);
          recognitionRef.current = null;
        }
      }
    };

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setError(null);
  }, [config, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.stop();
    }
    setListening(false);
    setInterim('');
  }, []);

  const speak = useCallback((text: string) => {
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config?.ttsRate ?? 1.0;
    utterance.pitch = config?.ttsPitch ?? 1.0;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, [config]);

  const stopSpeaking = useCallback(() => {
    synthRef.current.cancel();
    setSpeaking(false);
  }, []);

  const toggleListening = () => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div style={containerStyle}>
      <button
        onClick={toggleListening}
        style={{
          ...voiceBtnStyle,
          background: listening ? 'var(--color-error)' : 'var(--bg-elevated)',
          borderColor: listening ? 'var(--color-error)' : 'var(--border-default)',
          color: listening ? '#fff' : 'var(--text-secondary)',
          boxShadow: listening ? '0 0 10px rgba(255,83,112,0.4)' : 'none',
        }}
        title={listening ? 'Stop listening' : 'Listen to my Voice'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <span style={{ fontSize: 'var(--text-xs)' }}>
          {listening ? 'Listening...' : 'Voice'}
        </span>
      </button>

      {speaking && (
        <button onClick={stopSpeaking} style={speakBtnStyle} title="Stop speaking">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        </button>
      )}

      {listening && interim && (
        <span style={interimStyle}>{interim}</span>
      )}

      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  flexShrink: 0,
};

const voiceBtnStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-2xl)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  transition: 'all 200ms ease',
  lineHeight: 1,
  flexShrink: 0,
};

const speakBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-full)',
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'var(--transition-fast)',
  flexShrink: 0,
};

const interimStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '120px',
};

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
};
