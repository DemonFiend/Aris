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


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
