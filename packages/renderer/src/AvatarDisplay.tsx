import { useRef, useEffect, useState, useCallback } from 'react';
import { AvatarScene, IdleAnimation, ExpressionController, GestureController, sentimentToExpression } from '@aris/avatar';
import type { Expression, GestureType } from '@aris/avatar';
import type { AvatarInfo, CompanionConfig } from '@aris/shared';

interface Props {
  /** Text of latest assistant message — used to drive expressions */
  lastAssistantMessage?: string;
}

export function AvatarDisplay({ lastAssistantMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);
  const idleRef = useRef<IdleAnimation | null>(null);
  const exprRef = useRef<ExpressionController | null>(null);
  const gestureRef = useRef<GestureController | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initScene = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || sceneRef.current) return;

    try {
      const scene = new AvatarScene(canvas);
      sceneRef.current = scene;

      // Load default avatar
      const avatars = ((await window.aris.invoke('avatar:list-available')) ?? []) as AvatarInfo[];
      const defaultAvatar = avatars.find((a) => a.isDefault) ?? avatars[0];

      let vrmLoaded = false;

      if (defaultAvatar) {
        try {
          const avatarUrl = `avatar://${defaultAvatar.filename}`;
          const vrm = await scene.loadVRM(avatarUrl);

          const companionConfig = (await window.aris.invoke('companion:get-config')) as CompanionConfig | null;

          const idle = new IdleAnimation();
          idle.setVRM(vrm);
          if (companionConfig?.idle) {
            idle.setConfig(companionConfig.idle);
          }
          idleRef.current = idle;

          const expr = new ExpressionController();
          expr.setVRM(vrm);
          if (companionConfig?.personality?.defaultExpression) {
            expr.setExpression(companionConfig.personality.defaultExpression as Expression);
          }
          exprRef.current = expr;

          const gesture = new GestureController();
          gesture.setVRM(vrm);
          gestureRef.current = gesture;

          scene.onFrame((delta: number) => {
            idle.update(delta);
            expr.update(delta);
            gesture.update(delta);
          });
          vrmLoaded = true;
        } catch {
          // VRM load failed — fall through to ghost fallback
        }
      }

      if (!vrmLoaded) {
        // Render a simple procedural ghost as fallback
        scene.loadGhostFallback();
      }

      scene.start();
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load avatar');
    }
  }, []);

  useEffect(() => {
    initScene();
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      idleRef.current = null;
      exprRef.current = null;
      gestureRef.current = null;
    };
  }, [initScene]);

  // Listen for gesture triggers from main process
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:gesture', (gesture: unknown) => {
      gestureRef.current?.play(gesture as GestureType);
    });
    return cleanup;
  }, []);

  // Resize handler — debounced so the model only repositions after resize ends
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let timeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight);
      }, 150);
    });
    observer.observe(canvas);
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  // Drive expressions from assistant messages
  useEffect(() => {
    if (!lastAssistantMessage || !exprRef.current) return;
    const expression = sentimentToExpression(lastAssistantMessage);
    exprRef.current.setExpression(expression as Expression);
  }, [lastAssistantMessage]);

  return (
    <div style={wrapperStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {!loaded && !error && (
        <div style={overlayStyle}>
          <span style={{ color: '#888', fontSize: '0.85rem' }}>Loading avatar...</span>
        </div>
      )}
      {error && (
        <div style={overlayStyle}>
          <span style={{ color: '#e55', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
            {error}
          </span>
        </div>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: 200,
  background: '#0a0a0a',
  borderRadius: '8px',
  overflow: 'hidden',
};

const canvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(10, 10, 10, 0.8)',
};
