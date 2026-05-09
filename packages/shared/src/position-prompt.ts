import type { PositionContext, ScreenQuadrant } from './types';

const QUADRANT_PHRASES: Record<ScreenQuadrant, string> = {
  'top-left': 'in the top-left of the player\'s screen',
  'top-right': 'in the top-right of the player\'s screen',
  'bottom-left': 'in the bottom-left of the player\'s screen',
  'bottom-right': 'in the bottom-right of the player\'s screen',
  center: 'floating in the center of the player\'s screen',
};

/**
 * Build the location phrase that describes where Aris's window is.
 *
 * - Overlay mode (always-on-top) → use the screen quadrant, since the user can drag the
 *   window anywhere over their game.
 * - Otherwise → use the dock position (e.g., "on the right side of the screen").
 *
 * Returns the full bracketed instruction line that gets appended to the system prompt.
 */
export function buildPositionPromptLine(posCtx: PositionContext): string {
  const location = describePosition(posCtx);
  return `\n\n[You are ${location}. You may subtly reference this when it feels natural, but NEVER mention window dimensions, pixels, or technical details like "docked" — just be aware of where you are.]`;
}

/**
 * Pure description of the window's location, without the surrounding instruction text.
 * Exported separately so callers (and tests) can assert on the phrasing alone.
 */
export function describePosition(posCtx: PositionContext): string {
  if (posCtx.overlayMode) {
    return `${QUADRANT_PHRASES[posCtx.screenQuadrant]}, overlaying on top of their game`;
  }
  if (posCtx.dockPosition === 'floating') {
    return 'floating on screen';
  }
  if (posCtx.dockPosition === 'fullscreen') {
    return 'in fullscreen';
  }
  return `on the ${posCtx.dockPosition} side of the screen`;
}
