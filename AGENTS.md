# Agent Instructions

This project uses **bd (beads)** for issue tracking. Run `bd prime` for full workflow context.

`.beads/` is **gitignored (local-only)** — do not run `bd sync` or expect issues in git.

## Quick Reference

```bash
bd ready                                       # Find unblocked work
bd list --status=open                          # All open issues
bd show <id>                                   # Issue details
bd create --title="..." --type=task --priority=2   # New issue (0=critical, 4=backlog)
bd update <id> --status=in_progress            # Claim work
bd close <id>                                  # Complete work
bd dep add <issue> <depends-on>                # Add dependency
```

## Core Rules

- **Use bd for ALL task tracking.** Do NOT use TodoWrite, TaskCreate, or markdown task files.
- Create a beads issue BEFORE writing code; mark `in_progress` when starting.
- Priority is `0-4` or `P0-P4` (0=critical, 2=medium, 4=backlog) — never "high"/"medium"/"low".
- Do NOT use `bd edit` — it opens `$EDITOR` and blocks. Use `bd update <id> --title/--description/--notes`.
- When creating many issues at once, batch them with parallel subagents.

## Session Close Protocol

Work is NOT complete until pushed to `origin/main`. Before saying "done":

```
[ ] git status                       (check what changed)
[ ] git add <files>                  (stage code changes — NEVER stage .beads/)
[ ] git commit -m "..."              (commit code)
[ ] git push                         (push to remote)
[ ] bd close <id>                    (mark issue complete locally)
```

`.beads/` is gitignored — do not stage it, do not run `bd sync`.

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
