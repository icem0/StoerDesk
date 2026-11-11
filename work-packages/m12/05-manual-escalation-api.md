# WP-M12-05: Manual escalation write API

format: small-model
status: done
depends-on: WP-M12-03
phase: 12
context-budget: 18k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 60

files-read:

- apps/api/src/tickets/workflow-routes.ts
- apps/api/src/tickets/escalation.ts
- apps/api/src/settings/escalation-stages.ts
- packages/shared/src/schemas/ticket.ts

files-write:

- apps/api/src/tickets/escalation-manual.ts
- apps/api/src/index.ts
- packages/shared/src/schemas/ticket.ts
- apps/api/src/tickets/__tests__/escalation-manual.integration.spec.ts

interfaces:

- `POST /api/v1/tickets/:ticketNo/escalate` guarded by `ticket.comment`
- body `{ stageKey: string | null, text: string }`
- append-only event `escalation_set` with `{ stageKey, stageName, text }` or `comment`

## Task

1. Add the request schema: `stageKey` nullable, `text` 1–2000 characters.
2. Resolve `ticketNo` and the configured stage; an unknown stage key answers
   `400 invalid_request`.
3. Insert exactly one append-only event in a transaction: `comment` for
   `stageKey = null`, otherwise `escalation_set` with the stage snapshot.
4. Register the route next to the workflow routes and add the integration test.

## Non-goals

- No status, assignment or deadline change.
- No notification.
- No offline outbox.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run test:run -- apps/api/src/tickets/__tests__/escalation-manual.integration.spec.ts
npm run wp:check
```

Expected: all green; the test proves comment and stage writes plus the unknown key.

## Handoff

- Files changed: route, shared schema, index, integration test.
- Interfaces added: see above.
- Verified: typecheck, integration test.
- Follow-up WP: WP-M12-06 — ticket detail redesign.
- Open question: none
