# WP-M42-01: The failed delivery reaches the mailbox of the administration

format: ctx-256k
status: done
depends-on: WP-M30-05
phase: 42
milestone: m42
context-budget: 34k tokens
spec: specs/10-notifications.md §11.7, §11.8, §11.18; PLAN.md §12
spec-lines: 90
changed-lines: 360

files-read:

- specs/10-notifications.md (§11.7 the delivery, §11.8 the problems, §11.18 the task)
- docs/DECISIONS/0052-the-task-and-the-protocol.md
- apps/api/src/notifications/alarm.ts
- apps/api/src/notifications/outbox.ts (`drainOutbox`, `alarmOfFailedDelivery`)
- apps/api/src/notifications/items.ts (`writeItems`, `ItemDelivery`)
- apps/api/src/auth/requirePermission.ts (`usersWithPermission`)
- apps/web/src/settings/settings-page.tsx (the badge of the open problems)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

files-write:

- apps/api/src/notifications/alarm.ts
- apps/api/src/notifications/outbox.ts
- apps/api/src/notifications/__tests__/delivery-failure-alarm.integration.spec.ts
- apps/api/src/notifications/__tests__/phase30-exit.integration.spec.ts
- apps/web/src/settings/settings-page.tsx
- apps/web/src/settings/__tests__/settings-page.test.tsx
- apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- packages/shared/src/i18n/server.de.json, packages/shared/src/i18n/server.en.json
- specs/10-notifications.md, PLAN.md
- docs/DECISIONS/0062-the-failed-delivery-reaches-the-mailbox.md, docs/DECISIONS.md, docs/DECISIONS/0052-the-task-and-the-protocol.md

interfaces:

- `deliveryFailureItems(database, failure, now?): Promise<ItemDelivery[]>` — the tasks of the alarm
- `enqueueDeliveryFailureItems(database, failure, now?): Promise<number>` — writes them into the mailbox
- the settings page carries no badge of the delivery problems any more

## Task

The office saw the failing deliveries only as a badge on the settings page
(`app.channelWarning.badge`) and wants it gone. The alarm of a failed delivery
existed since ADR-0052, but it fired only for a message that was lost after the
whole chain and it went over the confirmed channels of the administrators — so
an administrator without a confirmed channel learned nothing and a delivery
that a fallback still carried stayed a badge.

1. **The alarm fires for every failed delivery.** `apps/api/src/notifications/outbox.ts`:
   a row that ends `FAILED` calls `alarmOfFailedDelivery` — also when
   `finishRow` queued the next channel of the chain. The row of a broken
   channel (`channel.health_warning`) and the alarm itself stay silent.
2. **The task lives in the mailbox only.** `apps/api/src/notifications/alarm.ts`:
   `deliveryFailureItems` answers one `ItemDelivery` per user with
   `notification.read_all` and no longer reads the confirmed channels;
   `enqueueDeliveryFailureItems` writes them with `writeItems`. No
   `notification_messages` row and no outbox row is written, so the alarm
   cannot fail over a channel of its own and never alarms itself.
3. **The throttle stays.** One task per channel and machine code per hour, read
   from `notification_items` — a broken channel does not flood the inbox.
4. **The text says a delivery failed**, not that a message never arrived:
   `inbox.task.deliveryFailed` (de/en) and the server texts
   `notification.delivery_failure_*` name the failure.
5. **The settings page loses the badge.** `settings-page.tsx` drops the
   `deliveryProblems` query, the `usePermission` guard and the link; the texts
   `app.channelWarning.*` leave both locale files. The `/admin/delivery` page,
   its quittature and the dashboard tile stay untouched.
6. **The tests.** The integration test proves the task of an administrator
   **without** a confirmed channel, the throttle and that the alarm writes no
   outbox row; the page tests prove that the settings page no longer renders
   the badge and that the task text names the failed delivery.

## Non-goals

- No change of the `/admin/delivery` page, of its quittature or of the
  dashboard tile.
- No change of the daily warning of a broken channel (§11.15, ADR-0028).
- No new permission and no new route.
- No change of the retry and of the fallback chain of §11.7.

## Acceptance

```bash
npm run check
```

Expected result: all green; the new cases fail before the change and pass
after it.

## Handoff

- Files changed: the alarm module, the hook in the drain, the settings page,
  the texts of the interface and of the server, the spec, the plan, the ADR,
  the module map, the changelog, the backlog and this package
- Interfaces added: `deliveryFailureItems`, `enqueueDeliveryFailureItems`; the
  deliveries of the alarm over the channels of the administration are gone
- Verified: `npm run check` green
- Follow-up WP: none
- Open question: none
