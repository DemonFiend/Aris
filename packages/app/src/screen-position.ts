import { BrowserWindow, screen } from 'electron';
import type { MonitorInfo, MonitorGridLayout, RelativeGaze, ScreenPositionMode, ScreenPositionState } from '@aris/shared';
import { getSetting, setSetting } from './settings-store';
import { getStatus } from './capture-service';
import { loadCaptureSettings } from './screenshot-store';

/**
 * Returns all connected monitors sorted left-to-right by bounds.x.
 * Assigns 0-based index and human-readable label.
 */
export function getMonitorInfo(): MonitorInfo[] {
  const displays = screen.getAllDisplays();
  const primaryId = screen.getPrimaryDisplay().id;

  return displays
    .slice()
    .sort((a, b) => a.bounds.x - b.bounds.x)
    .map((display, index) => ({
      id: display.id,
      label: `Monitor ${index + 1}`,
      index,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      isPrimary: display.id === primaryId,
    }));
}

/**
 * Divides the monitor's work area into a 3x3 grid and returns the cell
 * (1-9, row-major, 1-indexed) that the window center falls into.
 *
 * Grid layout:
 *   1 | 2 | 3
 *   4 | 5 | 6
 *   7 | 8 | 9
 */
export function computeGridCell(
  windowBounds: Electron.Rectangle,
  monitorWorkArea: Electron.Rectangle,
): number {
  const centerX = windowBounds.x + windowBounds.width / 2;
  const centerY = windowBounds.y + windowBounds.height / 2;

  const colWidth = monitorWorkArea.width / 3;
  const rowHeight = monitorWorkArea.height / 3;

  const col = Math.min(2, Math.max(0, Math.floor((centerX - monitorWorkArea.x) / colWidth)));
  const row = Math.min(2, Math.max(0, Math.floor((centerY - monitorWorkArea.y) / rowHeight)));

  return row * 3 + col + 1; // 1-indexed, row-major
}

// Spiral default layout: cells 1-9 (row-major) → monitorNumber (1-based)
// Layout: 6 4 5 / 3 1 2 / 9 7 8  (matches center-out spiral)
const DEFAULT_SPIRAL: Record<number, number> = {
  1: 6, 2: 4, 3: 5,
  4: 3, 5: 1, 6: 2,
  7: 9, 8: 7, 9: 8,
};

/**
 * Builds a default MonitorGridLayout for the given monitor list.
 * Uses the spiral default, placing only monitors that exist (monitorNumber ≤ N).
 * Empty cells → null.
 */
export function defaultMonitorGrid(monitors: MonitorInfo[]): MonitorGridLayout {
  const n = monitors.length;
  const cells: Record<number, number | null> = {};
  for (let cell = 1; cell <= 9; cell++) {
    const monitorNumber = DEFAULT_SPIRAL[cell];
    cells[cell] = monitorNumber <= n ? monitorNumber - 1 : null; // store 0-based index
  }
  return { cells };
}

/**
 * Reads the persisted monitor grid from settings, falling back to defaultMonitorGrid.
 * Self-repairs if monitor count changed.
 */
export function getMonitorGrid(monitors?: MonitorInfo[]): MonitorGridLayout {
  const mon = monitors ?? getMonitorInfo();
  const n = mon.length;

  let grid: MonitorGridLayout | null = null;
  try {
    const raw = getSetting('screenPosition.monitorGrid');
    if (raw) grid = JSON.parse(raw) as MonitorGridLayout;
  } catch {
    grid = null;
  }

  if (!grid) return defaultMonitorGrid(mon);

  // Self-repair: drop indices that no longer exist
  const usedIndices = new Set<number>();
  const repairedCells: Record<number, number | null> = {};
  for (let cell = 1; cell <= 9; cell++) {
    const idx = grid.cells[cell];
    if (idx === null || idx === undefined) {
      repairedCells[cell] = null;
    } else if (idx >= n) {
      repairedCells[cell] = null; // monitor no longer exists
    } else {
      repairedCells[cell] = idx;
      usedIndices.add(idx);
    }
  }

  // Self-repair: append new monitors into first empty default cells
  const defaultGrid = defaultMonitorGrid(mon);
  const defaultCellOrder = [5, 6, 4, 3, 2, 1, 7, 8, 9]; // center-first for new monitor placement
  for (let idx = 0; idx < n; idx++) {
    if (usedIndices.has(idx)) continue;
    // Find first empty cell in defaultCellOrder
    for (const cell of defaultCellOrder) {
      if (repairedCells[cell] === null || repairedCells[cell] === undefined) {
        // Prefer to put it in its default slot if empty
        const defaultSlot = (Object.entries(defaultGrid.cells) as [string, number | null][])
          .find(([, v]) => v === idx);
        const targetCell = defaultSlot ? parseInt(defaultSlot[0], 10) : cell;
        if (repairedCells[targetCell] === null || repairedCells[targetCell] === undefined) {
          repairedCells[targetCell] = idx;
        } else {
          repairedCells[cell] = idx;
        }
        usedIndices.add(idx);
        break;
      }
    }
  }

  // Ensure all 9 cells exist
  for (let cell = 1; cell <= 9; cell++) {
    if (!(cell in repairedCells)) repairedCells[cell] = null;
  }

  return { cells: repairedCells };
}

/**
 * Returns the MGZ cell (1-9) that the given monitorIndex occupies, or null.
 */
export function monitorCellOf(grid: MonitorGridLayout, monitorIndex: number): number | null {
  for (let cell = 1; cell <= 9; cell++) {
    if (grid.cells[cell] === monitorIndex) return cell;
  }
  return null;
}

const DIRECTION_MAP: Record<string, string> = {
  '0,-1': 'up',
  '0,1': 'down',
  '-1,0': 'left',
  '1,0': 'right',
  '-1,-1': 'up-left',
  '1,-1': 'up-right',
  '-1,1': 'down-left',
  '1,1': 'down-right',
};

function cellToColRow(cell: number): [number, number] {
  const zero = cell - 1;
  return [zero % 3, Math.floor(zero / 3)]; // [col, row], both 0-2
}

function sgsToOffset(sgsCell: number): [number, number] {
  // SGS cell 1-9, row-major. Return fractional offset within monitor: -1=left/top edge, +1=right/bottom edge
  const zero = sgsCell - 1;
  const col = zero % 3; // 0=left, 1=center, 2=right
  const row = Math.floor(zero / 3); // 0=top, 1=middle, 2=bottom
  // Map to -1..+1 thirds
  const xOffset = col - 1; // -1, 0, 1
  const yOffset = row - 1; // -1, 0, 1
  return [xOffset, yOffset];
}

/**
 * Computes the relative gaze direction from Aris's monitor/position toward the game monitor.
 */
export function computeRelativeGaze(
  grid: MonitorGridLayout,
  arisMonitorIndex: number,
  arisSgsCell: number,
  gameMonitorIndex: number | null,
): RelativeGaze | null {
  if (gameMonitorIndex === null) return null;

  if (arisMonitorIndex === gameMonitorIndex) {
    return { dx: 0, dy: 0, direction: 'same-monitor' };
  }

  const arisCell = monitorCellOf(grid, arisMonitorIndex);
  const gameCell = monitorCellOf(grid, gameMonitorIndex);

  if (arisCell === null || gameCell === null) return null;

  const [arisCol, arisRow] = cellToColRow(arisCell);
  const [gameCol, gameRow] = cellToColRow(gameCell);

  let dx = gameCol - arisCol;
  let dy = gameRow - arisRow;

  // Refine with SGS position within Aris's cell
  const [sgsX, sgsY] = sgsToOffset(arisSgsCell);
  // If Aris is at the same column but her SGS is already toward the game direction, reinforce
  if (dx === 0 && sgsX !== 0) dx = sgsX;
  if (dy === 0 && sgsY !== 0) dy = sgsY;

  // Clamp to unit direction
  const ndx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const ndy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  const direction = DIRECTION_MAP[`${ndx},${ndy}`] ?? 'same-monitor';
  return { dx: ndx, dy: ndy, direction };
}

/**
 * Derives the game monitor index from the active screen-capture source.
 * - captureMode 'monitor': maps screen source name to monitor index
 * - captureMode 'window': uses screen.getDisplayNearestPoint on window center (best-effort)
 * - capture off/none: null
 */
export function getGameMonitorIndex(monitors: MonitorInfo[]): number | null {
  const status = getStatus();
  if (!status.active || !status.sourceId) return null;

  const settings = loadCaptureSettings();
  const captureMode = settings.captureMode;

  if (captureMode === 'monitor') {
    // desktopCapturer screen source names are "Screen 1", "Screen 2", etc. (left-to-right)
    const sourceName = status.sourceName ?? '';
    const match = sourceName.match(/Screen\s+(\d+)/i);
    if (match) {
      const screenNum = parseInt(match[1], 10) - 1; // 0-based
      return screenNum < monitors.length ? screenNum : null;
    }
    // Fallback: parse from sourceId format "screen:N:0"
    const idMatch = status.sourceId.match(/^screen:(\d+):/);
    if (idMatch) {
      const idx = parseInt(idMatch[1], 10);
      return idx < monitors.length ? idx : null;
    }
    return null;
  }

  if (captureMode === 'window') {
    // We don't have window bounds synchronously; return null.
    // A future async implementation could call desktopCapturer.getSources to get bounds.
    return null;
  }

  return null;
}

/**
 * Builds the full ScreenPositionState for the given window.
 */
export function getScreenPositionState(win: BrowserWindow): ScreenPositionState {
  const mode: ScreenPositionMode = (getSetting('screenPosition.mode') as ScreenPositionMode) ?? 'disabled';
  const monitors = getMonitorInfo();

  if (mode === 'disabled') {
    return {
      mode,
      monitors,
      positions: {},
      activeMonitorIndex: null,
      activeGridCell: null,
      globalPosition: null,
      monitorGrid: defaultMonitorGrid(monitors),
      gameMonitorIndex: null,
      relativeGaze: null,
    };
  }

  const bounds = win.getBounds();
  const windowCenterX = bounds.x + bounds.width / 2;
  const windowCenterY = bounds.y + bounds.height / 2;

  // Find which monitor the window center is on
  const display = screen.getDisplayNearestPoint({ x: windowCenterX, y: windowCenterY });
  const activeMonitor = monitors.find((m) => m.id === display.id) ?? monitors[0];
  const activeMonitorIndex = activeMonitor?.index ?? 0;

  const workArea = display.workArea;
  const activeGridCell = computeGridCell(bounds, workArea);
  const globalPosition = activeMonitorIndex * 9 + activeGridCell;

  const monitorGrid = getMonitorGrid(monitors);
  const gameMonitorIndex = getGameMonitorIndex(monitors);
  const relativeGaze = computeRelativeGaze(monitorGrid, activeMonitorIndex, activeGridCell, gameMonitorIndex);

  if (mode === 'auto') {
    const positions: Record<number, number | null> = {};
    for (const m of monitors) {
      positions[m.index] = m.index === activeMonitorIndex ? activeGridCell : null;
    }
    return {
      mode,
      monitors,
      positions,
      activeMonitorIndex,
      activeGridCell,
      globalPosition,
      monitorGrid,
      gameMonitorIndex,
      relativeGaze,
    };
  }

  // custom mode: read stored positions from settings
  let customPositions: Record<number, number | null> = {};
  try {
    const raw = getSetting('screenPosition.customPositions');
    if (raw) customPositions = JSON.parse(raw);
  } catch {
    customPositions = {};
  }

  const storedCell = customPositions[activeMonitorIndex] ?? null;
  const customGlobalPosition =
    storedCell != null ? activeMonitorIndex * 9 + storedCell : null;

  return {
    mode,
    monitors,
    positions: customPositions,
    activeMonitorIndex,
    activeGridCell: storedCell,
    globalPosition: customGlobalPosition,
    monitorGrid,
    gameMonitorIndex,
    relativeGaze,
  };
}

/**
 * Validates and persists a MonitorGridLayout to settings.
 * Throws if the layout is invalid.
 */
export function setMonitorGrid(layout: MonitorGridLayout, monitors: MonitorInfo[]): void {
  const { cells } = layout;
  const usedIndices = new Set<number>();

  for (let cell = 1; cell <= 9; cell++) {
    const val = cells[cell];
    if (val === null || val === undefined) continue;
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val >= monitors.length) {
      throw new Error(`Cell ${cell}: invalid monitorIndex ${val}`);
    }
    if (usedIndices.has(val)) {
      throw new Error(`Monitor index ${val} used in multiple cells`);
    }
    usedIndices.add(val);
  }

  setSetting('screenPosition.monitorGrid', JSON.stringify(layout));
}
