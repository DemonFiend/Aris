import { describe, it, expect } from 'vitest';
import { adaptiveOffset } from './base-pose';

describe('adaptiveOffset', () => {
  it('returns full target when rest is at zero (T-pose model)', () => {
    expect(adaptiveOffset(1.2, 0)).toBe(1.2);
    expect(adaptiveOffset(-1.2, 0)).toBe(-1.2);
  });

  it('returns reduced offset when rest is partway to target', () => {
    expect(adaptiveOffset(1.2, 0.5)).toBeCloseTo(0.7);
    expect(adaptiveOffset(-1.2, -0.5)).toBeCloseTo(-0.7);
  });

  it('returns zero when rest already meets target', () => {
    expect(adaptiveOffset(1.2, 1.2)).toBe(0);
    expect(adaptiveOffset(-1.2, -1.2)).toBe(0);
  });

  it('returns zero when rest exceeds target in target direction (A-pose model)', () => {
    expect(adaptiveOffset(1.2, 1.4)).toBe(0);
    expect(adaptiveOffset(-1.2, -1.4)).toBe(0);
  });

  it('does not flip sign when rest is past target in opposite direction', () => {
    // If target wants +1.2 but rest is -0.3, we want to go forward to 1.2,
    // so offset = 1.5 (full corrective delta in target direction).
    expect(adaptiveOffset(1.2, -0.3)).toBeCloseTo(1.5);
    expect(adaptiveOffset(-1.2, 0.3)).toBeCloseTo(-1.5);
  });

  it('returns zero when target is zero', () => {
    expect(adaptiveOffset(0, 0)).toBe(0);
    expect(adaptiveOffset(0, 0.5)).toBe(0);
  });
});
