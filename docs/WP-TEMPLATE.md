# WP-XX-YY: Short imperative title

format: small-model
depends-on: —
phase: 0
context-budget: 18k tokens
spec: PLAN.md §16
spec-lines: 40

files-read:

- PLAN.md
- path/to/file.ts

files-write:

- path/to/file.ts
- path/to/file.test.ts

interfaces:

- `functionName(input: Input): Promise<Output>`
- `GET /api/v1/example`

## Task

Describe one vertical slice in 3–6 numbered steps. Name the exact files and the
expected behaviour. Do not describe unrelated refactors.

1. Add the schema and migration.
2. Implement the service function.
3. Add the route and Zod schema.
4. Add the test.

## Non-goals

- No UI in this WP.
- No notification channel.
- No unrelated cleanup.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; the new test fails before the change and passes
after it.

## Handoff

- Files changed:
- Interfaces added:
- Follow-up WP:
- Open question (if any):
