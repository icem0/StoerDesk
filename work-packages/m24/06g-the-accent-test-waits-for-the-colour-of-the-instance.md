# WP-M24-06g: the accent test waits for the colour of the instance

format: small-model
status: done
depends-on: WP-M24-06f
phase: 24
milestone: m24
context-budget: 6k tokens
spec: specs/14-ui.md §14.4, ADR-0036
spec-lines: 20

files-read:

- apps/web/e2e/accent.spec.ts (the test of the accent colour)
- apps/web/src/components/Shell.tsx (the shell and the colour of the instance)

files-write:

- apps/web/e2e/accent.spec.ts

interfaces:

- none — only the waiting of the test changes

## Task

1. The test of the accent colour read the painted colour right after the
   navigation to `/tickets`. The shell writes the saved colour into
   `--brand-accent` when its branding request has answered (ADR-0036,
   WP-M16-03) — on a slow runner the test read the default colour of the
   stylesheet and the run failed with `#0ea5e9` instead of `#ff0000`.
2. The test waits for the colour of the instance now: it polls the painted
   `--brand-accent` until the saved colour is there and asserts the same
   values as before.

## Non-goals

- No change of the shell — the colour reaches the interface as before.
- No change of the assertions — the test still proves the saved colour, the
  ramp and the two menu entries.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run test:e2e
```

Expected: all green; the test waits for the colour instead of racing it.

## Handoff

- Files changed: the test of the accent colour
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-08 — the code over the channel confirms the account
- Open question: none
