import { defineConfig } from '@playwright/test';

// Force production mode so the Electron app loads built renderer files
// instead of trying to connect to the Vite dev server (localhost:5173).
process.env.NODE_ENV = 'production';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1, // Electron tests must run serially
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],
});
