import { describe, it, expect, vi } from 'vitest';

// Mock Electron and store modules so pure logic functions can be imported without a running app.
vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [],
    getPrimaryDisplay: () => ({ id: 0 }),
    getDisplayNearestPoint: () => ({ id: 0, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  BrowserWindow: class {},
}));
vi.mock('./settings-store', () => ({ getSetting: vi.fn(() => null), setSetting: vi.fn() }));
vi.mock('./capture-service', () => ({ getStatus: vi.fn(() => ({ active: false })) }));
vi.mock('./screenshot-store', () => ({ loadCaptureSettings: vi.fn(() => ({ captureMode: 'monitor', fps: 1, maxWidth: 1920, maxHeight: 1080, jpegQuality: 80 })) }));

import type { MonitorInfo, MonitorGridLayout } from '@aris/shared';
import { defaultMonitorGrid, computeRelativeGaze, monitorCellOf, setMonitorGrid } from './screen-position';

function makeMonitors(n: number): MonitorInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    label: `Monitor ${i + 1}`,
    index: i,
    bounds: { x: i * 1920, y: 0, width: 1920, height: 1080 },
    isPrimary: i === 0,
  }));
}

describe('defaultMonitorGrid', () => {
  it('1 monitor: only monitor 0 placed at cell 5 (center)', () => {
    const grid = defaultMonitorGrid(makeMonitors(1));
    expect(grid.cells[5]).toBe(0); // monitor number 1 → index 0 at cell 5
    const placed = Object.values(grid.cells).filter((v) => v !== null);
    expect(placed).toHaveLength(1);
  });

  it('2 monitors: monitors 0 and 1 placed at their spiral cells', () => {
    const grid = defaultMonitorGrid(makeMonitors(2));
    // monitorNumber 1 → index 0, placed at cell 5 (DEFAULT_SPIRAL[5]=1)
    // monitorNumber 2 → index 1, placed at cell 6 (DEFAULT_SPIRAL[6]=2)
    expect(grid.cells[5]).toBe(0);
    expect(grid.cells[6]).toBe(1);
    const placed = Object.values(grid.cells).filter((v) => v !== null);
    expect(placed).toHaveLength(2);
  });

  it('6 monitors: all 6 placed, cells 7/8/9 are null', () => {
    const grid = defaultMonitorGrid(makeMonitors(6));
    const placed = Object.values(grid.cells).filter((v) => v !== null);
    expect(placed).toHaveLength(6);
    // Cells 7,8,9 have spiral values 9,7,8 → monitorNumbers > 6 → null
    expect(grid.cells[7]).toBeNull();
    expect(grid.cells[8]).toBeNull();
    expect(grid.cells[9]).toBeNull();
  });

  it('9 monitors: all 9 cells filled', () => {
    const grid = defaultMonitorGrid(makeMonitors(9));
    const placed = Object.values(grid.cells).filter((v) => v !== null);
    expect(placed).toHaveLength(9);
    // All values should be 0-8
    for (const v of placed) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(9);
    }
    // No duplicates
    expect(new Set(placed).size).toBe(9);
  });
});

describe('computeRelativeGaze', () => {
  // Build a 2-monitor grid: monitor 0 at cell 5 (center), monitor 1 at cell 6 (right of center)
  function twoMonitorGrid(): MonitorGridLayout {
    return { cells: { 1: null, 2: null, 3: null, 4: null, 5: 0, 6: 1, 7: null, 8: null, 9: null } };
  }

  it('same monitor → direction "same-monitor"', () => {
    const gaze = computeRelativeGaze(twoMonitorGrid(), 0, 5, 0);
    expect(gaze?.direction).toBe('same-monitor');
    expect(gaze?.dx).toBe(0);
    expect(gaze?.dy).toBe(0);
  });

  it('game is to the right → direction "right"', () => {
    // Aris on monitor 0 (cell 5, col 1), game on monitor 1 (cell 6, col 2)
    const gaze = computeRelativeGaze(twoMonitorGrid(), 0, 5, 1);
    expect(gaze?.direction).toBe('right');
    expect(gaze?.dx).toBe(1);
  });

  it('game is to the left → direction "left"', () => {
    // Reverse: Aris on monitor 1 (cell 6), game on monitor 0 (cell 5)
    const gaze = computeRelativeGaze(twoMonitorGrid(), 1, 5, 0);
    expect(gaze?.direction).toBe('left');
    expect(gaze?.dx).toBe(-1);
  });

  it('diagonal: up-right', () => {
    // Aris at cell 8 (col 1, row 2), game at cell 3 (col 2, row 0) → dx=1, dy=-2 → up-right
    const grid: MonitorGridLayout = {
      cells: { 1: null, 2: null, 3: 1, 4: null, 5: null, 6: null, 7: null, 8: 0, 9: null },
    };
    const gaze = computeRelativeGaze(grid, 0, 5, 1);
    expect(gaze?.direction).toBe('up-right');
  });

  it('null game monitor → returns null', () => {
    const gaze = computeRelativeGaze(twoMonitorGrid(), 0, 5, null);
    expect(gaze).toBeNull();
  });

  it('game monitor not in grid → returns null', () => {
    const gaze = computeRelativeGaze(twoMonitorGrid(), 0, 5, 99);
    expect(gaze).toBeNull();
  });
});

describe('setMonitorGrid validation', () => {
  it('accepts valid layout with nulls', () => {
    const monitors = makeMonitors(2);
    const layout: MonitorGridLayout = {
      cells: { 1: null, 2: null, 3: null, 4: null, 5: 0, 6: 1, 7: null, 8: null, 9: null },
    };
    expect(() => setMonitorGrid(layout, monitors)).not.toThrow();
  });

  it('rejects duplicate monitor index', () => {
    const monitors = makeMonitors(2);
    const layout: MonitorGridLayout = {
      cells: { 1: null, 2: null, 3: null, 4: null, 5: 0, 6: 0, 7: null, 8: null, 9: null },
    };
    expect(() => setMonitorGrid(layout, monitors)).toThrow(/used in multiple cells/);
  });

  it('rejects out-of-range monitor index', () => {
    const monitors = makeMonitors(2);
    const layout: MonitorGridLayout = {
      cells: { 1: null, 2: null, 3: null, 4: null, 5: 0, 6: 5, 7: null, 8: null, 9: null },
    };
    expect(() => setMonitorGrid(layout, monitors)).toThrow(/invalid monitorIndex/);
  });

  it('rejects negative monitor index', () => {
    const monitors = makeMonitors(2);
    const layout: MonitorGridLayout = {
      cells: { 1: null, 2: null, 3: null, 4: null, 5: -1, 6: 1, 7: null, 8: null, 9: null },
    };
    expect(() => setMonitorGrid(layout, monitors)).toThrow(/invalid monitorIndex/);
  });
});
