import type { CompanionPersonality, PersonaTone, PersonaTraits, InteractionFrequency, HumorLevel, ExpressivenessLevel, AdvancedModifier } from './types';

/** Subset of personality fields used by a preset */
interface PersonaPreset {
  tone: PersonaTone;
  traits: PersonaTraits;
  interactionFrequency: InteractionFrequency;
  humor: HumorLevel;
  expressiveness: ExpressivenessLevel;
  advancedModifiers: AdvancedModifier[];
}

export const PERSONA_PRESETS: Record<'supportive-gamer' | 'sassy-gamer', PersonaPreset> = {
  'supportive-gamer': {
    tone: 'warm',
    traits: 'supportive',
    interactionFrequency: 'frequently-initiates',
    humor: 'light',
    expressiveness: 'high',
    advancedModifiers: ['energetic', 'affectionate'],
  },
  'sassy-gamer': {
    tone: 'playful',
    traits: 'mischievous',
    interactionFrequency: 'frequently-initiates',
    humor: 'sarcastic',
    expressiveness: 'high',
    advancedModifiers: ['bold', 'competitive'],
  },
};

const INTERACTION_FREQUENCY_DESCRIPTIONS: Record<InteractionFrequency, string> = {
  'only-when-spoken-to': 'only speak when spoken to',
  'occasionally-initiates': 'occasionally initiate conversation',
  'frequently-initiates': 'frequently initiate conversation',
};

export function buildPersonaSystemPrompt(personality: CompanionPersonality): string {
  const suffix = 'You help players with tips, strategies, lore, and conversation. Be concise.';

  // Advanced mode with custom prompt
  if (personality.mode === 'advanced' && personality.customPrompt) {
    const base = personality.customPrompt.trim();
    if (base.length > 0) {
      return `You are Aris, an AI gaming companion. ${base}\n\n${suffix}`;
    }
  }

  // Preset-based prompt
  if (personality.activePreset === 'supportive-gamer') {
    return `You are Aris, an upbeat and encouraging AI gaming companion. You watch gameplay and commentate with enthusiasm, celebrating achievements and cheering the player on. You are warm, energetic, and always supportive.\n\n${suffix}`;
  }

  if (personality.activePreset === 'sassy-gamer') {
    return `You are Aris, a playfully sarcastic AI gaming companion. You take the perspective of a dead teammate judging the player's moves with chaotic humor, while also hyping them up for great plays and boasting about recent achievements. You are bold, competitive, and entertainingly sassy.\n\n${suffix}`;
  }

  // Simple mode: construct from selector values
  const frequencyDesc = INTERACTION_FREQUENCY_DESCRIPTIONS[personality.interactionFrequency];
  let prompt = `You are Aris, a ${personality.tone} AI gaming companion. Your personality is ${personality.traits}. You ${frequencyDesc}. Your humor style is ${personality.humor}. You express yourself with ${personality.expressiveness} intensity.`;

  if (personality.advancedModifiers.length > 0) {
    prompt += ` Additional traits: ${personality.advancedModifiers.join(', ')}.`;
  }

  return `${prompt}\n\n${suffix}`;
}
