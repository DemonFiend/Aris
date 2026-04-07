# Aris - AI Gaming Companion

## Completion Workflow (Mandatory)

Every task that touches code MUST follow this flow before being marked `done`:

1. **Build** - `pnpm build` must succeed with no errors
2. **QA with Playwright** - `pnpm test:e2e` must pass. If tests fail, fix the issue before proceeding.
3. **Push to remote** - `git push origin main` so the board can `git pull` immediately
4. **Then mark done** - Only after steps 1-3 pass

Never mark a task as `done` or `in_review` with unpushed commits on `main`.

## Testing

- Unit tests: `pnpm test` (vitest)
- E2E tests: `pnpm test:e2e` (Playwright, requires `pnpm build` first)
- E2E tests live in `tests/e2e/*.spec.ts`
- Playwright config: `playwright.config.ts` (serial, 30s timeout, 1 retry)

When fixing a bug, add or update an e2e test that covers the fix.

## Project Structure

- `packages/app` - Electron main process
- `packages/renderer` - React frontend (Vite)
- `packages/shared` - Shared types/utils
- CSP is configured in two places:
  - `packages/app/src/main.ts` (session handler, authoritative at runtime)
  - `packages/renderer/index.html` (meta tag fallback)
