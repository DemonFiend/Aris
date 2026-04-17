import { BrowserWindow } from 'electron';
import type { ScreenAnalysisContext, CompanionPersonality } from '@aris/shared';
import { getSetting } from './settings-store';

/** Cooldown constants */
const PER_GAME_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
const GLOBAL_COOLDOWN_MS = 10 * 60 * 1000;   // 10 minutes
const SUSTAINED_PLAY_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes for occasionally-initiates

/** State tracking */
let previousGame: string | null = null;
let lastGlobalReactionTime = 0;
const gameCooldowns = new Map<string, number>();
const gameFirstSeen = new Map<string, number>();
let announcedGameCount = 0;

type ReactionCallback = (prompt: string) => Promise<{ text: string }>;
type MessageDelivery = (text: string) => void;

let generateReaction: ReactionCallback | null = null;
let deliverMessage: MessageDelivery | null = null;
let reactionInFlight = false;

/** Initialize the reaction system with callbacks. */
export function initScreenReactions(
  reactionCb: ReactionCallback,
  messageCb: MessageDelivery,
): void {
  generateReaction = reactionCb;
  deliverMessage = messageCb;
}

/** Call this whenever screen context updates. Checks for game changes and triggers reactions. */
export function onScreenContextUpdate(context: ScreenAnalysisContext): void {
  const newGame = context.detectedGame;
  const gameChanged = newGame !== previousGame;

  if (gameChanged && newGame) {
    // Track when we first saw this game
    if (!gameFirstSeen.has(newGame)) {
      gameFirstSeen.set(newGame, Date.now());
    }
    triggerGameChangeReaction(newGame);
  } else if (newGame && !gameChanged) {
    // Same game sustained — check for delayed announcement
    checkSustainedPlayReaction(newGame);
  }

  previousGame = newGame ?? previousGame;
}

function triggerGameChangeReaction(game: string): void {
  const personality = loadPersonality();
  if (!personality) return;

  const freq = personality.interactionFrequency;

  if (freq === 'only-when-spoken-to') {
    // Silent mode — no proactive reactions
    return;
  }

  if (freq === 'occasionally-initiates') {
    // Announce every other game change
    announcedGameCount++;
    if (announcedGameCount % 2 !== 0) {
      // Skip this one — will be caught by sustained play check if user plays 20+ min
      return;
    }
  }

  // freq === 'frequently-initiates' always announces

  emitReaction(game, 'launch', personality);
}

function checkSustainedPlayReaction(game: string): void {
  const personality = loadPersonality();
  if (!personality) return;

  if (personality.interactionFrequency !== 'occasionally-initiates') return;

  const firstSeen = gameFirstSeen.get(game);
  if (!firstSeen) return;

  const elapsed = Date.now() - firstSeen;
  if (elapsed < SUSTAINED_PLAY_THRESHOLD_MS) return;

  // Only trigger once per sustained play session
  const cooldownEnd = gameCooldowns.get(game) ?? 0;
  if (Date.now() < cooldownEnd) return;

  emitReaction(game, 'sustained', personality);
}

function emitReaction(
  game: string,
  trigger: 'launch' | 'sustained',
  personality: CompanionPersonality,
): void {
  if (reactionInFlight) return;
  if (!generateReaction || !deliverMessage) return;

  // Check global cooldown
  if (Date.now() - lastGlobalReactionTime < GLOBAL_COOLDOWN_MS) return;

  // Check per-game cooldown
  const cooldownEnd = gameCooldowns.get(game) ?? 0;
  if (Date.now() < cooldownEnd) return;

  // Build the reaction prompt
  const triggerDesc =
    trigger === 'launch'
      ? `The user just started playing ${game}.`
      : `The user has been playing ${game} for over 20 minutes now.`;

  const toneHint = buildToneHint(personality);

  const prompt = [
    `You are ${personality.name}, an AI gaming companion.`,
    `Your personality tone is ${personality.tone}, your traits are ${personality.traits}.`,
    toneHint,
    triggerDesc,
    'React naturally in character, keeping it brief (1-2 sentences max).',
    'Do NOT use emojis unless your personality is playful or chaotic.',
    'Be natural — this is a casual observation, not an announcement.',
  ].join(' ');

  reactionInFlight = true;
  lastGlobalReactionTime = Date.now();
  gameCooldowns.set(game, Date.now() + PER_GAME_COOLDOWN_MS);

  generateReaction(prompt)
    .then((result) => {
      if (result.text && deliverMessage) {
        deliverMessage(result.text);
        // Broadcast to renderer as a proactive message
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('ai:proactive-message', {
            text: result.text,
            trigger: trigger,
            game,
          });
        }
      }
    })
    .catch((err) => {
      console.warn('[screen-reaction] Reaction generation failed:', err instanceof Error ? err.message : err);
    })
    .finally(() => {
      reactionInFlight = false;
    });
}

function buildToneHint(personality: CompanionPersonality): string {
  const hints: string[] = [];

  // Tone-based hints
  switch (personality.tone) {
    case 'calm':
    case 'professional':
      hints.push('Keep it understated and measured.');
      break;
    case 'playful':
    case 'dramatic':
      hints.push('Be expressive and lively.');
      break;
    case 'dry':
      hints.push('Be deadpan and subtle.');
      break;
    case 'cheerful':
      hints.push('Be upbeat and excited.');
      break;
  }

  // Trait-based hints
  if (personality.traits === 'reserved' || personality.advancedModifiers.includes('shy')) {
    hints.push('Be subtle — a quiet observation rather than a loud announcement.');
  }
  if (personality.traits === 'chaotic' || personality.advancedModifiers.includes('competitive')) {
    hints.push('Be playfully provocative or competitive about the game.');
  }
  if (personality.advancedModifiers.includes('energetic')) {
    hints.push('Bring high energy like a personal announcer.');
  }

  return hints.join(' ');
}

function loadPersonality(): CompanionPersonality | null {
  try {
    const raw = getSetting('companion-config');
    if (!raw) return null;
    const config = JSON.parse(raw);
    return config.personality ?? null;
  } catch {
    return null;
  }
}

/** Reset all reaction state (e.g., on provider switch). */
export function resetReactionState(): void {
  previousGame = null;
  lastGlobalReactionTime = 0;
  gameCooldowns.clear();
  gameFirstSeen.clear();
  announcedGameCount = 0;
  reactionInFlight = false;
}
