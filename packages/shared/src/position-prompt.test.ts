import { describe, it, expect } from 'vitest';
import type { PositionContext } from './types';
import { buildPositionPromptLine, describePosition } from './position-prompt';

function makeCtx(overrides: Partial<PositionContext> = {}): PositionContext {
  return {
    dockPosition: 'floating',
    screenQuadrant: 'center',
    overlayMode: false,
    windowBounds: { x: 0, y: 0, width: 400, height: 600 },
    screenBounds: { width: 1920, height: 1080 },
    ...overrides,
  };
}

describe('describePosition', () => {
  it('uses screenQuadrant when overlay mode is on (top-left)', () => {
    const phrase = describePosition(
      makeCtx({ overlayMode: true, screenQuadrant: 'top-left', dockPosition: 'floating' }),
    );
    expect(phrase).toBe(
      "in the top-left of the player's screen, overlaying on top of their game",
    );
  });

  it('uses "in the center" wording for the center quadrant in overlay mode', () => {
    const phrase = describePosition(
      makeCtx({ overlayMode: true, screenQuadrant: 'center', dockPosition: 'floating' }),
    );
    expect(phrase).toBe(
      "floating in the center of the player's screen, overlaying on top of their game",
    );
    // Must not call the center a corner.
    expect(phrase).not.toMatch(/top-left|top-right|bottom-left|bottom-right/);
  });

  it('uses dock-position phrasing when overlay mode is off (right)', () => {
    const phrase = describePosition(
      makeCtx({ overlayMode: false, dockPosition: 'right' }),
    );
    expect(phrase).toBe('on the right side of the screen');
  });

  it('keeps "floating on screen" for floating dock when overlay is off', () => {
    const phrase = describePosition(
      makeCtx({ overlayMode: false, dockPosition: 'floating' }),
    );
    expect(phrase).toBe('floating on screen');
  });

  it('overlay mode wins over dockPosition (e.g., dock=right but overlayMode=true)', () => {
    const phrase = describePosition(
      makeCtx({ overlayMode: true, screenQuadrant: 'bottom-right', dockPosition: 'right' }),
    );
    expect(phrase).toBe(
      "in the bottom-right of the player's screen, overlaying on top of their game",
    );
  });
});

describe('buildPositionPromptLine', () => {
  it('wraps the description in the bracketed instruction tail', () => {
    const line = buildPositionPromptLine(
      makeCtx({ overlayMode: true, screenQuadrant: 'top-right' }),
    );
    expect(line).toContain("You are in the top-right of the player's screen");
    expect(line).toContain('overlaying on top of their game');
    expect(line).toContain(
      'NEVER mention window dimensions, pixels, or technical details',
    );
    // Starts with the two newlines separator so it appends cleanly to the persona prompt.
    expect(line.startsWith('\n\n[')).toBe(true);
    expect(line.endsWith(']')).toBe(true);
  });

  it('produces dock-side phrasing for overlay-off + right (regression for ARI-239)', () => {
    const line = buildPositionPromptLine(
      makeCtx({ overlayMode: false, dockPosition: 'right' }),
    );
    expect(line).toContain('You are on the right side of the screen');
    expect(line).not.toContain('overlaying on top');
  });
});
