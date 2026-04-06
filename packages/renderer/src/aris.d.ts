import type { IpcChannel } from '@aris/shared';

declare global {
  interface Window {
    aris: {
      invoke(channel: IpcChannel, ...args: unknown[]): Promise<unknown>;
      on(channel: string, callback: (...args: unknown[]) => void): () => void;
    };
  }
}
