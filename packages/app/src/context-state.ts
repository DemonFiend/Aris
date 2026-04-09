import { BrowserWindow } from 'electron';
import type { UserContextSignals } from '@aris/shared';
import { captureEvents } from './capture-service';
import { getStatus as getCaptureStatus } from './capture-service';

let currentSignals: UserContextSignals = {
  captureActive: false,
  detectedGame: undefined,
};

/** Broadcast context signal changes to all renderer windows. */
function broadcastContextState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('context:state-changed', currentSignals);
  }
}

/** Return current context signals (used by IPC handler). */
export function getContextState(): UserContextSignals {
  return { ...currentSignals };
}

/** Initialize context state tracking — call once at app startup. */
export function initContextState(): void {
  // Sync with current capture status
  const status = getCaptureStatus();
  currentSignals = {
    captureActive: status.active,
    detectedGame: status.detectedGame,
  };

  // Listen for capture state changes
  captureEvents.on('state-changed', (event: { active: boolean; sourceName?: string }) => {
    const status = getCaptureStatus();
    const next: UserContextSignals = {
      captureActive: event.active,
      detectedGame: status.detectedGame,
    };

    if (
      next.captureActive !== currentSignals.captureActive ||
      next.detectedGame !== currentSignals.detectedGame
    ) {
      currentSignals = next;
      broadcastContextState();
    }
  });
}
