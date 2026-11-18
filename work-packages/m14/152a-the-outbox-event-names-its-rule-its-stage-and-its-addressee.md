# WP-M14-152a: the outbox event names its rule, its stage and its addressee

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.8, §11.16; specs/07-escalation.md §7.5
spec-lines: 30

depends-on: WP-M14-152

files-read:

- apps/api/src/notifications/outbox.ts (claimOutboxRow, finishRow, enqueuePersonalDeliveries)
- apps/api/src/notifications/messages.ts (the name of an addressee)
- apps/api/src/db/schema.ts (`outbox`, `notificationMessages`, `users`)

files-write:

- apps/api/src/notifications/outbox.ts

interfaces:

- the payload of `notification_sent`/`notification_failed` gains `rule`, `stage`,
  `recipient` and `target` when the row carries them

## Task

1. `apps/api/src/notifications/outbox.ts`: a small helper `recipientNameOf` answers
   the name of the addressee of the personal message of a claimed row — the row
   of `notification_messages` behind `notificationMessageId` joined to `users`,
   given and family name, the e-mail only as the fallback (§11.16). A row
   without a personal message has no addressee.
2. `finishRow`: the appended event payload additionally carries, when the row
   target has them, `rule` from `escalationRule`, `stage` from `escalationStage`,
   `target` from `targetName` and `recipient` from the helper. A row of the
   report path or of the minimum channels carries none of these keys, so its
   payload stays as it was.
3. The outbox tests assert the new keys for the row of a fired escalation rule
   (its target params already exist) and that a `ticket.created` row writes no
   such key; the unit test of the drain keeps its existing assertions.

## Non-goals

- No new column, table or migration: the names live in the jsonb payload.
- No change of the escalation engine: WP-M14-152b supplies `targetName`.
- No rendering change: the ticket history reads the payload in WP-M14-152c.
- No topic, token, address or contact value in the payload — the names only.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green; a notification event of a fired rule names rule, stage,
target and recipient and a report row stays unchanged.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
