# WP-M34-02a: The API tells the technician that his duty is gone

format: ctx-256k
status: done
depends-on: WP-M34-01
phase: 34
context-budget: 56k tokens
spec: specs/04-oncall.md §4a.3, specs/10-notifications.md §11.4, §11.5, PLAN.md §8
spec-lines: 220
changed-lines: 300

files-read:

- PLAN.md (§8, §16, §17)
- specs/04-oncall.md (§4a.3)
- specs/10-notifications.md (§11.4, §11.5)
- apps/api/src/oncall/service.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/db/schema.ts
- apps/api/src/oncall/__tests__/allocation-notifications.integration.spec.ts

files-write:

- specs/10-notifications.md
- specs/04-oncall.md
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/0068_oncall_released.sql
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/notifications/outbox.ts
- apps/api/src/oncall/service.ts
- packages/shared/src/schemas/notification.ts
- packages/shared/src/i18n/server.de.json
- packages/shared/src/i18n/server.en.json

interfaces:

- `oncall.released` — the event type of the release of a shift (§11.4)
- `enqueueOncallOutbox(database, { shift, eventType, userId, release, standalone }, env)`
- `DELETE /api/v1/oncall/shifts/:id` — the release of the technician of the shift
- `PATCH /api/v1/oncall/shifts/:id` — the handover releases the old technician

## Task

1. **The event type.** `oncall.released` joins the readiness events in
   `packages/shared/src/schemas/notification.ts` and in the schema of the API;
   the migration `0068` widens the check of the `outbox` and the check of the
   row that points at a ticket or a shift: the row of a **deleted** shift
   belongs to no shift, so it survives the delete of its shift.
2. **The message.** The message of the release is translated like the warning
   of a broken channel: the title names the pool and the cause, the body the
   pool, the period of the shift and the cause in words. The machine values
   stay in the params (`release`, `poolName`, `startsAt`, `endsAt`).
3. **The enqueue.** `enqueueOncallOutbox` takes the cause of the release and
   the flag `standalone`: the row of a deleted shift points at no shift, the
   task of the technician names it nevertheless.
4. **The service.** The delete of a shift with a technician writes the release
   for him before the shift is deleted; the handover of a shift to another
   technician writes the release for the technician who had it. A shift that
   the technician declined himself is no duty of his.
5. **The test.** The integration test proves that the delete of a shift writes
   the row of the release and that the row survives the delete of the shift,
   that the handover writes the row with the cause `reassigned` and that a
   shift without a technician writes none.

## Non-goals

- No change of the rule of the delete (WP-M34-01).
- No chat of a shift and no readable readiness message — that is the work of
  the branch `feature/m34-readiness-and-shift-chat`.
- No new channel and no new way of a message.
- No text of the inbox — that is WP-M34-02b.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; the new tests fail before the change and pass
after it.

## Handoff

- Files changed: `apps/api/src/db/schema.ts` (the event type and the check of
  the row), `apps/api/src/db/migrations/0068_oncall_released.sql` (new),
  `apps/api/src/db/migrations/meta/_journal.json`,
  `apps/api/src/notifications/outbox.ts` (the message of the release, the
  `release` and the `standalone` of the enqueue, the row that points at no
  shift), `apps/api/src/oncall/service.ts` (the delete and the handover),
  `apps/api/src/oncall/__tests__/release-notifications.integration.spec.ts`
  (new), `packages/shared/src/schemas/notification.ts` (the event type),
  `packages/shared/src/i18n/server.de.json` and `.../server.en.json` (the texts
  of the release), `specs/04-oncall.md` and `specs/10-notifications.md`
- Interfaces added: the event type `oncall.released` (§11.4), the `release` and
  the `standalone` of `enqueueOncallOutbox`, the texts
  `notification.oncall_released_title`, `notification.oncall_released_body`,
  `notification.oncall_release_deleted` and
  `notification.oncall_release_reassigned`
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the integration test needs a PostgreSQL — it runs in the CI of
  the repository, the container of the session has no database
- Follow-up WP: WP-M34-02b — the inbox of the technician names the release of
  his shift.
- Open question: none
