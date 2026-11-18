# WP-M14-152b: the escalation names the target it was configured for

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/07-escalation.md §7.5; specs/10-notifications.md §11.8
spec-lines: 30

depends-on: WP-M14-152a

files-read:

- apps/api/src/escalation/actions.ts (the notify action)
- apps/api/src/db/schema.ts (`oncallPools`, `users`)
- apps/api/src/notifications/messages.ts (the name of a user)

files-write:

- apps/api/src/escalation/actions.ts

interfaces:

- the row target of a `notify` action carries `targetName` — the name of the
  configured target of the rule

## Task

1. `apps/api/src/escalation/actions.ts`, the `notify` branch: when the action
   carries a target, its name joins the row target as `targetName` — for a
   readiness pool the name of the pool (`oncallPools.name`), for a user the name
   of that user (given and family name, the e-mail as the fallback). The rows of
   the action already carry `escalationRule` and `escalationStage`, which WP-
   M14-152a writes into the event payload; a broadcast without a target stays
   without `targetName`.
2. The integration test of the actions asserts that the outbox row of a `notify`
   action with a pool target and with a user target carries `targetName` and that
   the `notification_sent` event of the drain names it.

## Non-goals

- No change of the delivery itself: the recipients and their topics stay the rule
  of §7.5 and ADR-0030.
- No new key in the shared contract: the target names live in the row jsonb.
- No name of a channel broadcast: nothing was configured beside the channels.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the event of a targeted notification names the target of the
configuration.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
