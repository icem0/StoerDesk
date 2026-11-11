# WP-M13-04: The seed of the stages and the rules

format: small-model
status: planned
depends-on: WP-M13-03
phase: 13
milestone: m13
context-budget: 20k tokens
spec: specs/07-escalation.md §7.1, §7.2, §7.6
spec-lines: 90

files-read:

- specs/07-escalation.md §7.1, §7.2
- packages/shared/src/schemas/escalation-config.ts (`DEFAULT_ESCALATION_RULES`)
- apps/api/src/db/seed-rbac.ts (the seed pattern)
- apps/api/src/db/seed-standard-texts.ts (the idempotent insert pattern)
- apps/api/src/index.ts (the startup wiring)

files-write:

- apps/api/src/db/seed-escalation.ts
- apps/api/src/index.ts
- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts

interfaces:

- `seedEscalation(database): Promise<{ stages: number, rules: number }>`
- the startup calls `seedEscalation(database)` next to the other seeds

## Task

1. Seed the five stages of §7.1 with their names and their position, when the
   table is empty; an existing row is never overwritten.
2. Seed the rules of §7.2 from `DEFAULT_ESCALATION_RULES` and take the minutes
   of an installation from the former settings rows
   `ticket.escalation.<rule>.minutes` and `.critical_minutes` (the standard value
   for `low`, `normal` and `high`, the critical value for `critical`).
3. Wire the seed into the direct start of the API, next to `seedRbac` and
   `seedBaseUser`.
4. Add the integration test: an empty database gets the five stages and the
   six rules, a second run changes nothing, and the legacy minutes win over the
   defaults.

## Non-goals

- No deletion of the legacy settings rows (they stay read-only, WP-M13-13).
- No service, no route, no UI.
- No change to the other seeds.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/db/__tests__/seed-escalation.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves the seed, the idempotency and the import of
the legacy minutes.

## Handoff

- Files changed: the seed, the startup wiring, the integration test
- Interfaces added: `seedEscalation`
- Verified: typecheck, the integration test
- Follow-up WP: WP-M13-05 — the configuration API
- Open question: none
