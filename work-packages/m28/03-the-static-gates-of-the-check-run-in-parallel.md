# WP-M28-03: the static gates of the check run in parallel

format: ctx-256k
status: done
depends-on: —
phase: 28
milestone: m28
context-budget: 40k tokens
spec: PLAN.md §18.1 (the gates of the check)
spec-lines: 20
changed-lines: 88

files-read:

- package.json (the scripts of the repository)
- PLAN.md §18.1 (the gates of the check)
- scripts/wp-check.mjs (a gate that runs on its own)

files-write:

- scripts/check.mjs
- package.json
- work-packages/m28/

interfaces:

- `npm run check` — the gate of the repository: the four static gates beside each other, then the tests, then the E2E

## Task

The gate of the repository ran its six gates strictly one after the other:
the typecheck, the lint, the tests, the i18n check, the check of the work
packages and the E2E. The typecheck and the lint read the sources and nothing
else — they do not need the database and not the ports of the machine — so
they waste 16 s of the wall time of the gate by waiting for each other.

1. **The runner** `scripts/check.mjs`: the four static gates — the typecheck,
   the lint, the i18n check and the check of the work packages — run beside
   each other, every gate with its own log. The first failure ends the run
   with the exit code of the gate.
2. **The order** `scripts/check.mjs`: the tests and the E2E wait for the static
   gates. The tests need the database, the E2E needs the ports of the machine
   (3174 and 5174) and a browser — they run one after the other, so a gate
   never fights with another one for the machine.
3. **The script** `package.json`: `npm run check` calls the runner. The single
   command of the gate stays the same, so `PLAN.md` §18.1 and the CI workflow
   do not change.

## Non-goals

- No change of a gate itself — the typecheck, the lint, the i18n check, the
  check of the work packages, the tests and the E2E stay as they are.
- No change of the CI workflow — it calls `npm run check` as before.
- No new gate and no skipped gate.

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: all green; the gate needs the same gates as before, the four static
gates finish in the time of the slowest one of them.

## Handoff

- Files changed: the runner of the gate and the script of the repository
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: **WP-M28-04** (the assertions of the migrations read the schema
  of the database instead of the text of the migration files)
- Open question: none
