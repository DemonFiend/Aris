---
name: playwright-testing
description: Write and run Playwright e2e tests for the Aris Electron app. Use when asked to create browser tests, verify UI features, run QA checks, or validate that implemented features work correctly in the rendered app.
---

# Playwright Testing for Aris

Use Playwright to write and run end-to-end tests against the Aris Electron app.

## Setup

Playwright is configured at the project root:
- Config: `playwright.config.ts`
- Tests: `tests/e2e/*.spec.ts`
- Run: `pnpm test:e2e` (headless) or `pnpm test:e2e:headed` (visible browser)

## Writing Electron Tests

Aris is an Electron app. Use Playwright's Electron support:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('example', async () => {
  const appPath = path.resolve(__dirname, '../../packages/app/dist/main.js');
  const electronApp = await electron.launch({ args: [appPath] });
  const window = await electronApp.firstWindow();

  // Test the renderer UI
  await expect(window.locator('selector')).toBeVisible();

  await electronApp.close();
});
```

## Key Patterns

- **Always close the app** in each test or use `test.afterEach` to prevent zombie processes
- **Build first**: Run `pnpm build` before e2e tests — they need compiled output
- **Use data-testid**: Prefer `[data-testid="..."]` selectors for stability
- **Electron IPC**: Access main process via `electronApp.evaluate()`
- **Screenshots**: Use `await window.screenshot({ path: 'screenshot.png' })` for visual checks

## Test Categories

| Category | Directory | Purpose |
|----------|-----------|---------|
| App lifecycle | `tests/e2e/app-*.spec.ts` | Launch, close, window management |
| Chat UI | `tests/e2e/chat-*.spec.ts` | Message sending, history, conversations |
| Settings | `tests/e2e/settings-*.spec.ts` | Provider config, API keys, preferences |
| Voice | `tests/e2e/voice-*.spec.ts` | STT/TTS controls, push-to-talk |
| Avatar | `tests/e2e/avatar-*.spec.ts` | 3D rendering, expressions, lip sync |
| Vision | `tests/e2e/vision-*.spec.ts` | Screen capture controls, source selection |

## MCP Server (Interactive Testing)

For interactive browser testing, Playwright's MCP server provides real-time browser control:

```bash
npx @playwright/mcp
```

This gives agents browser tools (click, type, navigate, snapshot, verify) without writing test files — useful for exploratory QA and feature verification.
