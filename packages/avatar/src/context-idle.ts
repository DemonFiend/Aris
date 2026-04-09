import type { IdleProfile } from '@aris/shared';
import type {
  ContextIdleMode,
  TimeOfDay,
  ContextModifiers,
} from '@aris/shared';
import {
  DEFAULT_IDLE_PROFILE,
  CONTEXT_MODE_MODIFIERS,
  TIME_OF_DAY_MODIFIERS,
  computeTimeOfDay,
} from '@aris/shared';
import type { IdleAnimation } from './idle-animation';
import type { IdleVariationManager } from './idle-variations';
import type { GazeController, GazeMode } from './gaze';

const AFK_THRESHOLD_SECONDS = 120; // 2 minutes of no input
const TOD_CHECK_INTERVAL = 60;     // re-check time-of-day every 60s

/** Maps context mode to the preferred gaze mode */
const CONTEXT_GAZE_MODE: Record<ContextIdleMode, GazeMode> = {
  default: 'idle',
  afk: 'idle',
  gaming: 'awareness',
  conversation: 'listening',
};

/**
 * ContextIdleController — state machine for context-dependent idle behavior.
 *
 * Determines the active context mode based on:
 * - Conversation state (AI streaming)
 * - Screen capture state (gaming)
 * - User activity (AFK timer)
 * - Time of day (system clock)
 *
 * Computes an effective IdleProfile by composing:
 *   personality profile * context modifiers * time-of-day modifiers
 * and applies it to the idle animation and variation controllers.
 */
export class ContextIdleController {
  // Input signals
  private captureActive = false;
  private conversationActive = false;
  private afkTime = 0;
  private timeOfDay: TimeOfDay = computeTimeOfDay();

  // State
  private activeMode: ContextIdleMode = 'default';
  private todCheckTimer = TOD_CHECK_INTERVAL;

  // Base personality profile (set from CompanionConfig personality tone)
  private personalityProfile: IdleProfile = { ...DEFAULT_IDLE_PROFILE };

  // Controlled subsystems
  private idle: IdleAnimation | null = null;
  private variations: IdleVariationManager | null = null;
  private gaze: GazeController | null = null;

  setControllers(
    idle: IdleAnimation,
    variations: IdleVariationManager,
    gaze: GazeController,
  ): void {
    this.idle = idle;
    this.variations = variations;
    this.gaze = gaze;
    this.applyEffectiveProfile();
  }

  /** Set the base personality idle profile (from IDLE_PROFILE_PRESETS). */
  setPersonalityProfile(profile: IdleProfile): void {
    this.personalityProfile = profile;
    this.applyEffectiveProfile();
  }

  /** Called when screen capture state changes (from main process IPC). */
  updateCaptureState(active: boolean): void {
    if (this.captureActive === active) return;
    this.captureActive = active;
    this.recomputeMode();
  }

  /** Called when AI conversation streaming state changes. */
  updateConversationState(streaming: boolean): void {
    if (this.conversationActive === streaming) return;
    this.conversationActive = streaming;
    this.recomputeMode();
  }

  /** Called on keyboard/mouse input in the renderer. */
  notifyInput(): void {
    const wasAfk = this.afkTime >= AFK_THRESHOLD_SECONDS;
    this.afkTime = 0;
    if (wasAfk) {
      this.recomputeMode();
    }
  }

  /** Call each frame to tick AFK timer and periodically recheck time-of-day. */
  update(delta: number): void {
    this.afkTime += delta;

    // Periodic time-of-day check
    this.todCheckTimer -= delta;
    if (this.todCheckTimer <= 0) {
      this.todCheckTimer = TOD_CHECK_INTERVAL;
      const newTod = computeTimeOfDay();
      if (newTod !== this.timeOfDay) {
        this.timeOfDay = newTod;
        this.applyEffectiveProfile();
      }
    }

    // Check for AFK transition (only when not in a higher-priority mode)
    if (
      this.activeMode === 'default' &&
      this.afkTime >= AFK_THRESHOLD_SECONDS
    ) {
      this.recomputeMode();
    }
  }

  getActiveMode(): ContextIdleMode {
    return this.activeMode;
  }

  private recomputeMode(): void {
    const prev = this.activeMode;

    // Priority: conversation > gaming > afk > default
    if (this.conversationActive) {
      this.activeMode = 'conversation';
    } else if (this.captureActive) {
      this.activeMode = 'gaming';
    } else if (this.afkTime >= AFK_THRESHOLD_SECONDS) {
      this.activeMode = 'afk';
    } else {
      this.activeMode = 'default';
    }

    if (prev !== this.activeMode) {
      this.applyEffectiveProfile();
      this.applyGazeMode();
    }
  }

  private applyEffectiveProfile(): void {
    const ctx: ContextModifiers = CONTEXT_MODE_MODIFIERS[this.activeMode];
    const tod: ContextModifiers = TIME_OF_DAY_MODIFIERS[this.timeOfDay];
    const p = this.personalityProfile;

    const effective: IdleProfile = {
      breathingMultiplier: p.breathingMultiplier * ctx.breathing * tod.breathing,
      swayMultiplier: p.swayMultiplier * ctx.sway * tod.sway,
      blinkFrequencyMultiplier: p.blinkFrequencyMultiplier * ctx.blinkFrequency * tod.blinkFrequency,
      bodyMultiplier: p.bodyMultiplier * ctx.body * tod.body,
      variationFrequencyMultiplier: p.variationFrequencyMultiplier * ctx.variationFrequency * tod.variationFrequency,
      fidgetProbability: p.fidgetProbability * ctx.fidget,
    };

    this.idle?.setIdleProfile(effective);
    this.variations?.setIdleProfile(effective);
  }

  private applyGazeMode(): void {
    this.gaze?.setMode(CONTEXT_GAZE_MODE[this.activeMode]);
  }
}
