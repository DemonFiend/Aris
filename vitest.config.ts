import { defineConfig } from 'vitest/config';

// Exclude Playwright E2E tests from the unit test runner. The E2E suite is
// executed separately via `pnpm test:e2e` and imports Playwright's test API,
// which causes conflicts when picked up by vitest.
export default defineConfig({
  test: {
    // Exclude E2E tests, build output, and node_modules to avoid picking up
    // Playwright tests (which import @playwright/test) and third-party test
    // files accidentally present in dependencies.
    exclude: ['tests/e2e/**', 'tests/fixtures/**', 'dist/**', 'node_modules/**'],
  },
});
