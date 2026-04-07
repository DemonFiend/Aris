import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannel } from '@aris/shared';

type EventChannel = 'ai:stream-chunk' | 'vision:frame' | 'voice:command' | 'voice:push-to-talk' | 'avatar:gesture' | 'window:position-changed' | 'screen:position-changed';

/**
 * Expose a typed IPC bridge to the renderer process.
 * The renderer calls window.aris.invoke(channel, ...args).
 */
contextBridge.exposeInMainWorld('aris', {
  invoke: (channel: IpcChannel, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: IpcChannel | EventChannel, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
});
