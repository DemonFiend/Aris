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

  // Load voice config
  useEffect(() => {
    (async () => {
      const cfg = (await window.aris.invoke('voice:get-config')) as VoiceConfig;
      setConfig(cfg);
    })();
  }, []);

  // Listen for voice commands from main process (push-to-talk, etc.)
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
      // Auto-restart if still supposed to be listening
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
          ...micBtnStyle,
          background: listening ? 'var(--color-error)' : 'var(--bg-elevated)',
          borderColor: listening ? 'var(--color-error)' : 'var(--border-default)',
        }}
        title={listening ? 'Stop listening' : 'Start voice input'}
      >
        {listening ? '⏹' : '🎤'}
      </button>

      {speaking && (
        <button onClick={stopSpeaking} style={speakBtnStyle} title="Stop speaking">
          🔇
        </button>
      )}

      {listening && interim && (
        <span style={interimStyle}>{interim}</span>
      )}

      {error && <span style={errorStyle}>{error}</span>}

      {speaking && <span style={statusStyle}>Speaking...</span>}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
};

const micBtnStyle: React.CSSProperties = {
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  lineHeight: 1,
  flexShrink: 0,
  transition: 'var(--transition-fast)',
};

const speakBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
  fontSize: 'var(--text-base)',
  lineHeight: 1,
  flexShrink: 0,
  transition: 'var(--transition-fast)',
};

const interimStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '200px',
};

const errorStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-error)',
};

const statusStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-info)',
};
