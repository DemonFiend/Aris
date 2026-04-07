import { useRef, useEffect, useState, useCallback } from 'react';
import { AvatarScene, IdleAnimation, IdleVariationManager, ExpressionController, GestureController, GazeController, sentimentToExpression } from '@aris/avatar';
import type { Expression, GestureType, DockHint } from '@aris/avatar';
import type { AvatarInfo, CompanionConfig, PositionContext, VirtualSpaceConfig } from '@aris/shared';

interface Props {
  /** Text of latest assistant message — used to drive expressions */
  lastAssistantMessage?: string;
  /** Whether the AI is currently streaming a response */
  streaming?: boolean;
}

export function AvatarDisplay({ lastAssistantMessage, streaming }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AvatarScene | null>(null);
  const idleRef = useRef<IdleAnimation | null>(null);
  const variationsRef = useRef<IdleVariationManager | null>(null);
  const exprRef = useRef<ExpressionController | null>(null);
  const gestureRef = useRef<GestureController | null>(null);
  const gazeRef = useRef<GazeController | null>(null);
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

          const variations = new IdleVariationManager();
          variations.setVRM(vrm);
          if (companionConfig?.idle) {
            if (companionConfig.idle.variationFrequency != null) {
              variations.setFrequencyScale(companionConfig.idle.variationFrequency);
            }
            if (companionConfig.idle.enabled === false) {
              variations.setFrequencyScale(0);
            }
          }
          variationsRef.current = variations;

          const expr = new ExpressionController();
          expr.setVRM(vrm);
          if (companionConfig?.personality?.defaultExpression) {
            expr.setExpression(companionConfig.personality.defaultExpression as Expression);
          }
          exprRef.current = expr;

          const gesture = new GestureController();
          gesture.setVRM(vrm);
          gestureRef.current = gesture;

          const gaze = new GazeController();
          gaze.setVRM(vrm);
          gazeRef.current = gaze;

          // Fetch initial position context for gaze awareness
          window.aris.invoke('window:get-position-context').then((ctx) => {
            if (ctx) {
              gaze.setDockHint((ctx as PositionContext).dockPosition as DockHint);
            }
          });

          scene.onFrame((delta: number) => {
            idle.resetBones();
            idle.update(delta);
            variations.update(delta);
            expr.update(delta);
            gesture.update(delta);
            gaze.update(delta);
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

      // Apply virtual space config (only when VRM is loaded — skip ghost mode)
      if (vrmLoaded) {
        window.aris.invoke('avatar:get-space-config').then((cfg) => {
          if (cfg) scene.applySpaceConfig(cfg as VirtualSpaceConfig);
        });
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
      variationsRef.current = null;
      exprRef.current = null;
      gestureRef.current = null;
      gazeRef.current = null;
    };
  }, [initScene]);

  // Listen for gesture triggers from main process
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:gesture', (gesture: unknown) => {
      gestureRef.current?.play(gesture as GestureType);
    });
    return cleanup;
  }, []);

  // Resize handler — debounced so the model only repositions after resize ends.
  // Depends on `loaded` so the observer re-initialises after the scene is ready,
  // and includes a window resize listener as fallback for Electron edge-cases.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;

    // Immediate resize to match current container dimensions
    sceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight);

    const handleResize = () => {
      sceneRef.current?.resize(canvas.clientWidth, canvas.clientHeight);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(canvas);
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [loaded]);

  // Listen for position changes and update gaze dock hint
  useEffect(() => {
    const cleanup = window.aris.on?.('window:position-changed', (ctx: unknown) => {
      if (ctx && gazeRef.current) {
        gazeRef.current.setDockHint((ctx as PositionContext).dockPosition as DockHint);
      }
    });
    return cleanup;
  }, []);

  // Switch gaze mode based on streaming state
  useEffect(() => {
    if (!gazeRef.current) return;
    if (streaming) {
      gazeRef.current.setMode('speaking');
    } else {
      gazeRef.current.setMode('idle');
    }
  }, [streaming]);

  // Drive expressions from assistant messages
  useEffect(() => {
    if (!lastAssistantMessage || !exprRef.current) return;
    const expression = sentimentToExpression(lastAssistantMessage);
    exprRef.current.setExpression(expression as Expression);
  }, [lastAssistantMessage]);

  // Apply live space config updates (only when VRM is loaded)
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:space-config-changed', (cfg: unknown) => {
      if (cfg && sceneRef.current && loaded) {
        sceneRef.current.applySpaceConfig(cfg as VirtualSpaceConfig);
      }
    });
    return cleanup;
  }, [loaded]);

  return (
    <div style={wrapperStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {!loaded && !error && (
        <div style={overlayStyle}>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading avatar...</span>
        </div>
      )}
      {error && (
        <div style={overlayStyle}>
          <span style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)', textAlign: 'center', padding: 'var(--space-4)' }}>
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
  background: 'var(--bg-canvas)',
  borderRadius: 'var(--radius-lg)',
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
  background: 'rgba(6, 13, 23, 0.85)',
};
