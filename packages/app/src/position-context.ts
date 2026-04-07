import { BrowserWindow, screen } from 'electron';
import type { PositionContext, DockPosition, ScreenQuadrant } from '@aris/shared';

const EDGE_THRESHOLD = 50; // px — how close to screen edge counts as "docked"

/**
 * Compute the current position context for a BrowserWindow.
 * Determines dock position, screen quadrant, overlay state, and bounds.
 */
export function getPositionContext(win: BrowserWindow): PositionContext {
  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  const workArea = display.workArea;

  return {
    dockPosition: computeDockPosition(bounds, workArea, win.isFullScreen()),
    screenQuadrant: computeQuadrant(bounds, workArea),
    overlayMode: win.isAlwaysOnTop(),
    windowBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    screenBounds: { width: workArea.width, height: workArea.height },
  };
}

function computeDockPosition(
  bounds: Electron.Rectangle,
  workArea: Electron.Rectangle,
  isFullScreen: boolean,
): DockPosition {
  if (isFullScreen) return 'fullscreen';

  const nearLeft = Math.abs(bounds.x - workArea.x) < EDGE_THRESHOLD;
  const nearRight = Math.abs((bounds.x + bounds.width) - (workArea.x + workArea.width)) < EDGE_THRESHOLD;
  const nearTop = Math.abs(bounds.y - workArea.y) < EDGE_THRESHOLD;
  const nearBottom = Math.abs((bounds.y + bounds.height) - (workArea.y + workArea.height)) < EDGE_THRESHOLD;

  // Spans full width → docked top or bottom
  const spansWidth = nearLeft && nearRight;
  if (spansWidth && nearTop && !nearBottom) return 'top';
  if (spansWidth && nearBottom && !nearTop) return 'bottom';

  // Spans full height → docked left or right
  const spansHeight = nearTop && nearBottom;
  if (spansHeight && nearLeft && !nearRight) return 'left';
  if (spansHeight && nearRight && !nearLeft) return 'right';

  // Snapped to an edge but not spanning → still report as docked
  if (nearLeft && !nearRight) return 'left';
  if (nearRight && !nearLeft) return 'right';
  if (nearTop && !nearBottom) return 'top';
  if (nearBottom && !nearTop) return 'bottom';

  return 'floating';
}

function computeQuadrant(bounds: Electron.Rectangle, workArea: Electron.Rectangle): ScreenQuadrant {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const midX = workArea.x + workArea.width / 2;
  const midY = workArea.y + workArea.height / 2;

  // If within 15% of screen center in both axes, call it "center"
  const xRatio = Math.abs(centerX - midX) / workArea.width;
  const yRatio = Math.abs(centerY - midY) / workArea.height;
  if (xRatio < 0.15 && yRatio < 0.15) return 'center';

  const isLeft = centerX < midX;
  const isTop = centerY < midY;

  if (isTop && isLeft) return 'top-left';
  if (isTop && !isLeft) return 'top-right';
  if (!isTop && isLeft) return 'bottom-left';
  return 'bottom-right';
}
