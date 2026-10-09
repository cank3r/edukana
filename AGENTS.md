<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Mandatory team coordination

Before any analysis, edit, migration, test plan, commit, or review:

1. Read `TEAM-COORDINATION.md`.
2. Read `.kiro/steering/current-state.md`, `.kiro/steering/simplicity.md`, and `.kiro/PLAN.md`.
3. Check active claims for overlapping files, models, migrations, or contracts.
4. Claim the exact scope in `TEAM-COORDINATION.md` before writing.
5. Do not alter another agent's active scope; coordinate through its GitHub PR/issue and wait for handoff.
6. Update the claim with status, evidence, blockers, and next step before ending work.

`CLAUDE.md` imports this file, so these rules apply to Claude. Codex and Kiro must follow the same startup protocol.
