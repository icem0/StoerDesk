# WP-M30-01: the message is a task and the delivery attempt is the protocol

format: ctx-256k
status: done
depends-on: WP-M29-09
phase: 30
milestone: m30
context-budget: 48k tokens
spec: specs/10-notifications.md §11.4, §11.7, §11.10, §11.11, §11.12, §11.16, §11.18; PLAN.md §12, §14, §16
spec-lines: 330
changed-lines: 560

files-read:

- specs/10-notifications.md §11.4, §11.7, §11.8, §11.9, §11.10, §11.11, §11.12, §11.15, §11.16, §11.17
- apps/api/src/notifications/outbox.ts (`enqueuePersonalDeliveries` — one row per user and channel)
- apps/api/src/notifications/messages.ts (the reading of the messages — the protocol of today)
- apps/api/src/notifications/receivers.ts (`personalRecipients` — the confirmed channels of a user)
- apps/api/src/db/schema.ts (`notification_messages`, `notification_preferences`, the checks of the outbox)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox as it is now)
- apps/web/src/components/notification-bell.tsx, apps/web/src/components/alarm-banner.tsx (the two readers of the count)
- docs/DECISIONS/0048-the-alarm-of-the-instance.md (ADR-0048, the last decision of phase 25)
- work-packages/README.md (the backlog of record)

files-write:

- docs/DECISIONS/0052-the-task-and-the-protocol.md
- docs/DECISIONS.md (the index of the decisions — ADR-0048 was missing, ADR-0052 is new)
- specs/10-notifications.md
- PLAN.md §12, §14, §16
- work-packages/README.md (the phase m30, the backlog of record)
- work-packages/m30/01-the-message-is-a-task-and-the-protocol.md — this document
- work-packages/m24/16-the-own-page-names-the-channels-of-the-user.md — the retroactive
  record of a commit that landed with the WP id but without the document

interfaces:

- `notification_items` — the table of the tasks: one row per user and event
- `notification_messages.notification_item_id` — the task of a delivery attempt
- `GET /api/v1/notifications/items` — the tasks of the signed-in user (§11.18)
- `GET /api/v1/notifications/items/unread-count` — the number of the unhandled tasks
- `PATCH /api/v1/notifications/items/:id/read` — the read receipt of one own task
- `GET /api/v1/admin/notifications/deliveries` — the protocol of the delivery (§11.16)
- the event type `notification.delivery_failed` — the instance event of a failed delivery

## Task

1. **ADR-0052** decides the model: a message is a **task** and a delivery attempt
   is the **protocol**. One task per user and event (a technician with three
   confirmed channels sees one task and not three), the inbox shows the task
   with its readable text, its deep link and its read receipt — and no channel
   and no delivery state; the protocol belongs to the administration on
   `/admin/notifications` and is guarded by `notification.read_all`. A delivery
   that fails finally becomes a task of the administration, delivered over the
   **own confirmed channels** of the recipients and throttled to one task per
   channel and machine code per hour. The decision names the state „handled“
   as **not** decided here: it belongs to the settings of the workflow.
2. **The spec** `specs/10-notifications.md` gains **§11.18** (the task of the
   user: the data model, the write rule, the count and the alarm, the task of a
   failed delivery) and **§11.16** becomes the protocol of the delivery with
   its filters and its answer. §11.4 names the instance events, §11.7 the
   failed delivery that becomes a task, §11.10 the table of the tasks, §11.11
   the four routes of the phase and the three routes that leave, §11.12 the
   two pages.
3. **PLAN.md** §12 carries the two new rules, §14 the two pages and §16 the
   row of the phase 30 with the exit criteria; the status of the phase names
   the defect of the inbox, the decision and the six packages.
4. **The backlog of record** `work-packages/README.md` gains the phase m30 and
   the six rows of the phase — and the **rows that were missing** for the
   phases 24 and 25: the table of record named neither the work packages of
   the phase 24 nor the ones of the phase 25 except four of them.
5. **The retroactive record** of WP-M24-16: the commit `f58d1450` carried the
   WP id in its subject, but the document of the work package never existed —
   a `Follow-up WP:` without a file is a defect (`AGENTS.md`).

## Non-goals

- No code, no migration, no route in this WP — the spec decides, the code
  follows.
- No change of the inbox page, of the bell and of the alarm band — the
  packages WP-M30-02 … WP-M30-06 change them.
- No decision about the state „handled“ and about the workflow settings.
- No change of the alarm of the instance (ADR-0048) and of the warning of the
  setup — the count of the tasks replaces the count of the messages later
  (WP-M30-04).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the spec, the ADR and the plan name the same model, and
`npm run wp:check` accepts the new packages of the profile `ctx-256k`.

## Handoff

- Files changed: the ADR, the index of the decisions, the spec of the
  notifications, `PLAN.md`, the backlog of record, this document and the
  retroactive record of WP-M24-16
- Interfaces added: the table `notification_items`, the column
  `notification_messages.notification_item_id`, the four routes of the phase and
  the event type `notification.delivery_failed`
- Verified: the commands above
- Follow-up WP: WP-M30-02 — the task of the user: the table, the write rule and
  the API (file created in this commit, `AGENTS.md`: a split creates files, not
  sentences)
- Open question: none
