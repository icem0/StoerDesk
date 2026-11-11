# WP-M13-05: The configuration API of the escalation

format: small-model
status: done
depends-on: WP-M13-02, WP-M13-03
phase: 13
milestone: m13
context-budget: 22k tokens
spec: specs/07-escalation.md §7.9
spec-lines: 40

files-read:

- specs/07-escalation.md §7.9
- apps/api/src/settings/escalation-stages.ts (the routes it replaces)
- apps/api/src/settings/deadlines.ts (the settings route pattern)
- packages/shared/src/schemas/escalation-config.ts
- apps/api/src/index.ts (the route registration)

files-write:

- apps/api/src/escalation/config.ts
- apps/api/src/escalation/routes.ts
- apps/api/src/index.ts
- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts

interfaces:

- `GET /api/v1/escalation/config` (`settings.read`)
- `PUT /api/v1/escalation/config` (`settings.write`) — rules and their actions
- `PUT /api/v1/escalation/stages` (`settings.write`) — names and the active flag
- `readEscalationConfig(database)`, `writeEscalationConfig(database, input)`

## Task

1. Read the configuration: the stages, the rules and the actions, ordered by
   their position, with the keys as the identity.
2. Replace the rules and their actions in one transaction: the body is validated
   with the shared schema, a malformed body answers `400 invalid_request` with
   the field paths, an unknown stage key or rule key is rejected.
3. Replace the names and the active flag of the stages; the keys of the stages
   are fixed and are never written.
4. Register the routes and add the integration test (read, replace, the invalid
   body and the unknown key).

## Non-goals

- No job, no engine, no UI.
- No actions are performed here; the configuration is only stored.
- No change to the deadlines settings route (WP-M13-13).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/escalation/__tests__/config-routes.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves the read, the replace and the two error
cases.

## Handoff

- Files changed: the configuration service, the routes, the registration, the test
- Interfaces added: the three routes and the two service functions
- Verified: typecheck, the integration test (read, replace, the unknown stage key, the malformed body, the stages)
- Follow-up WP: WP-M13-06 — the engine on the database rules
- Open question: none
