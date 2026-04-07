import { BrowserWindow, screen } from 'electron';
import type { MonitorInfo, ScreenPositionMode, ScreenPositionState } from '@aris/shared';
import { getSetting } from './settings-store';

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
  };
}
