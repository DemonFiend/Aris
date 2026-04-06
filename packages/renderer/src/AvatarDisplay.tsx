import { useRef, useEffect, useState, useCallback } from 'react';
import { AvatarScene, IdleAnimation, ExpressionController, sentimentToExpression } from '@aris/avatar';
import type { Expression } from '@aris/avatar';
import type { AvatarInfo } from '@aris/shared';

interface Props {
  /** Text of latest assistant message — used to drive expressions */
  lastAssistantMessage?: string;
}

export function AvatarDisplay({ lastAssistantMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);
  const idleRef = useRef<IdleAnimation | null>(null);
  const exprRef = useRef<ExpressionController | null>(null);
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

      if (!defaultAvatar) {
        setError('No avatar files found. Add .vrm files in Settings > Avatar.');
        return;
      }

      // Load the VRM model from the avatar data directory
      const avatarUrl = `avatar://${defaultAvatar.filename}`;
      const vrm = await scene.loadVRM(avatarUrl);

      // Initialize idle animation and expression controller
      const idle = new IdleAnimation();
      idle.setVRM(vrm);
      idleRef.current = idle;

      const expr = new ExpressionController();
      expr.setVRM(vrm);
      exprRef.current = expr;

      // Hook animations into render loop
      scene.onFrame((delta: number) => {
        idle.update(delta);
        expr.update(delta);
      });

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
    };
  }, [initScene]);

  // Resize handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => {
      sceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
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
