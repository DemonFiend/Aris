import { useRef, useEffect, useState, useCallback } from 'react';
import { AvatarScene, IdleAnimation, IdleVariationManager, ExpressionController, GestureController, GazeController, BasePose, NonHumanoidAnimator, MicroExpressionController, SurpriseAnimationController, PoseController, PhysicsReactionController, sentimentToExpression, sentimentToPose } from '@aris/avatar';
import type { Expression, GestureType, DockHint, PoseType } from '@aris/avatar';
import type { AvatarInfo, CompanionConfig, PositionContext, VirtualSpaceConfig, WindowShakeEvent } from '@aris/shared';

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
  const microExprRef = useRef<MicroExpressionController | null>(null);
  const surpriseRef = useRef<SurpriseAnimationController | null>(null);
  const poseRef = useRef<PoseController | null>(null);
  const physicsRef = useRef<PhysicsReactionController | null>(null);
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

          if (scene.isHumanoid) {
            // --- Humanoid pipeline: full bone-animation stack ---
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

            const basePose = new BasePose();
            basePose.setVRM(vrm);

            const pose = new PoseController();
            pose.setVRM(vrm);
            poseRef.current = pose;

            const microExpr = new MicroExpressionController();
            microExpr.setVRM(vrm);
            microExpr.setControllers(gesture, expr);
            microExprRef.current = microExpr;

            const surprise = new SurpriseAnimationController();
            surprise.setVRM(vrm);
            surprise.setControllers(expr, gesture);
            surpriseRef.current = surprise;

            const physics = new PhysicsReactionController();
            physics.setVRM(vrm);
            physics.setExpressionController(expr);
            physicsRef.current = physics;

            // Fetch initial position context for gaze awareness
            window.aris.invoke('window:get-position-context').then((ctx) => {
              if (ctx) {
                gaze.setDockHint((ctx as PositionContext).dockPosition as DockHint);
              }
            });

            scene.onFrame((delta: number) => {
              idle.resetBones();
              basePose.apply();
              pose.update(delta);   // held pose blends in after basePose, before idle
              idle.update(delta);
              variations.update(delta);
              physics.update(delta);    // window-shake physics reactions (additive bone)
              surprise.update(delta);   // AFK state + sleep head droop (additive bone)
              expr.update(delta);
              microExpr.update(delta);  // additive blend-shape twitches (runs after expr)
              gesture.update(delta);
              gaze.update(delta);
            });
          } else {
            // --- Non-humanoid pipeline: mesh-level animation + optional expressions ---
            const nhAnimator = new NonHumanoidAnimator();
            nhAnimator.setMesh(vrm.scene);

            // ExpressionController self-guards if expressionManager is absent,
            // so it's safe to wire up for non-humanoid VRMs that have blend shapes.
            const expr = new ExpressionController();
            expr.setVRM(vrm);
            if (companionConfig?.personality?.defaultExpression) {
              expr.setExpression(companionConfig.personality.defaultExpression as Expression);
            }
            exprRef.current = expr;

            scene.onFrame((delta: number) => {
              nhAnimator.update(delta);
              expr.update(delta);
            });
          }
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
      microExprRef.current = null;
      surpriseRef.current?.dispose();
      surpriseRef.current = null;
      poseRef.current = null;
      physicsRef.current = null;
    };
  }, [initScene]);

  // Listen for gesture triggers from main process
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:gesture', (gesture: unknown) => {
      gestureRef.current?.play(gesture as GestureType);
    });
    return cleanup;
  }, []);

  // Listen for explicit pose changes from main process
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:pose', (pose: unknown) => {
      poseRef.current?.setPose(pose as PoseType);
    });
    return cleanup;
  }, []);

  // Listen for window shake events — drive physics reactions
  useEffect(() => {
    const cleanup = window.aris.on?.('window:shake', (event: unknown) => {
      physicsRef.current?.triggerShake(event as WindowShakeEvent);
    });
    return cleanup;
  }, []);

  // Track user input for AFK detection (keyboard + mouse)
  useEffect(() => {
    const notify = () => surpriseRef.current?.notifyInput();
    document.addEventListener('keydown', notify);
    document.addEventListener('mousedown', notify);
    document.addEventListener('mousemove', notify);
    return () => {
      document.removeEventListener('keydown', notify);
      document.removeEventListener('mousedown', notify);
      document.removeEventListener('mousemove', notify);
    };
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

  // Drive expressions and pose from assistant messages
  useEffect(() => {
    if (!lastAssistantMessage) return;
    if (exprRef.current) {
      exprRef.current.setExpression(sentimentToExpression(lastAssistantMessage) as Expression);
    }
    if (poseRef.current) {
      poseRef.current.setPose(sentimentToPose(lastAssistantMessage));
    }
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

  // Apply explicit camera mode changes
  useEffect(() => {
    const cleanup = window.aris.on?.('avatar:camera-mode-changed', (mode: unknown) => {
      if ((mode === 'portrait' || mode === 'fullbody') && sceneRef.current) {
        sceneRef.current.setCameraMode(mode);
      }
    });
    return cleanup;
  }, []);

  // Mouse-tracked gaze — pass normalized screen coords to gaze controller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!gazeRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      gazeRef.current.setMousePosition(x, y);
    };
    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
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
