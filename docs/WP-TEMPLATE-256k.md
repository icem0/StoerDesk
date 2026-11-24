# WP-XX-YY: Short imperative title

<!-- The template of the vertical profile — the default for a new work package. -->

format: ctx-256k
status: planned
depends-on: —
phase: 0
context-budget: 48k tokens
spec: PLAN.md §16
spec-lines: 120
changed-lines: 420

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

Describe one feature from the database to the user interface in 5–8 numbered
steps. Name the exact files and the expected behaviour of every layer. Do not
describe unrelated refactors.

1. Add the schema and migration.
2. Implement the service function.
3. Add the route and the Zod schema.
4. Add the page or the component with its texts.
5. Add the test.

## Non-goals

- No feature that belongs to another work package.
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
- Verified:
- Follow-up WP: a follow-up needs its own WP file only when it is work of its
  own; a remark that belongs to this feature stays a line here
  (`AGENTS.md`, _Open follow-ups (mandatory closure)_)
- Open question (if any):
