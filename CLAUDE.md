# Aris - AI Gaming Companion

## Issue Tracking (Mandatory)

This project uses **bd (beads)** for all task tracking. The `.beads/` directory is gitignored (local-only).

- **Use `bd` for all task tracking — do NOT use `TodoWrite` or markdown files.**
- Create a beads issue BEFORE writing code, mark `in_progress` when starting, `bd close` when done.
- Run `bd prime` at the start of a session for full workflow context.

**Essential commands:**

```bash
bd ready                                       # Find unblocked work
bd list --status=open                          # All open issues
bd show <id>                                   # Issue details
bd create --title="..." --type=task --priority=2   # New issue (priority 0-4, 0=critical)
bd update <id> --status=in_progress            # Claim work
bd close <id>                                  # Complete work
bd dep add <issue> <depends-on>                # Add dependency
```

**Issue prefix:** `ARI` (e.g., `ARI-a3f2dd`).

## Completion Workflow (Mandatory)

Every task that touches code MUST follow this flow before being marked `done`:

1. **Build** - `pnpm build` must succeed with no errors
2. **QA with Playwright** - `pnpm test:e2e` must pass. If tests fail, fix the issue before proceeding.
3. **Push to remote** - `git push origin main` so the board can `git pull` immediately
4. **Close the bead** - `bd close <id>` (beads is local-only, no `bd sync` needed)
5. **Then mark done** - Only after steps 1-4 pass

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
