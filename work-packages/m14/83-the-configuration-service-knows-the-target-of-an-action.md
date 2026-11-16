# WP-M14-83: the configuration service knows the target of an action

format: small-model
status: planned
depends-on: WP-M14-82
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.14
spec-lines: 40

files-read:

- apps/api/src/escalation/config.ts (`actionConfig`, `writeEscalationConfig`)
- apps/api/src/oncall/coupling.ts (`resolveDefaultPool`)
- apps/api/src/db/schema.ts (`oncallPools`, `groups`)
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts

interfaces:

- `PUT /api/v1/escalation/config` — the target of an `offer` or `assign` action
  that names no existing pool or group answers `400 invalid_target` with the
  field paths

## Task

1. `apps/api/src/escalation/config.ts`: `actionConfig()` writes the target of an
   `offer` or an `assign` action into the `config` jsonb
   (`{ target: { kind, id } }`), so the round trip through
   `GET /api/v1/escalation/config` keeps it.
2. The service rule: an action whose target names no row of `oncall_pools`
   (kind `pool`) or no row of `groups` (kind `group`) is rejected with
   `400 invalid_target` and the field paths — the rule of the `status_change`
   target of WP-M14-40b, because the jsonb carries no foreign key.
3. The integration spec proves: a configuration with a valid target is stored
   and read back, a target of an unknown pool and of an unknown group answers
   `400 invalid_target`, and the stored action keeps its target.

## Non-goals

- No UI (WP-M14-84) and no change of the ticket view (WP-M14-85).
- No deletion of a pool or a group that an action still names: the target of an
  installed action may name a removed pool, the action then changes nothing.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the extended integration spec fails before the change and
passes after it.

## Handoff

- Files changed: the configuration service, its integration spec
- Interfaces added: the error code `invalid_target`
- Verified:
- Follow-up WP: WP-M14-84 (the administration UI)
- Open question: none
