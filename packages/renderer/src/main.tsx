import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Provide a no-op IPC shim when running outside Electron (e.g. browser dev mode).
// The UI renders and is navigable; IPC-dependent features simply no-op.
if (!window.aris) {
  (window as any).aris = {
    invoke: async (..._args: unknown[]) => undefined,
    on: (_channel: string, _cb: (...args: unknown[]) => void) => () => {},
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
