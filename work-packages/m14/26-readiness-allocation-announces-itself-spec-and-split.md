# WP-M14-26: The readiness allocation announces itself — spec, ADR-0021 and the split

format: small-model
status: planned
depends-on: WP-M14-25
phase: 14
milestone: m14
context-budget: 26k tokens
spec: PLAN.md §8, §12, §16, §19; specs/04-oncall.md, specs/10-notifications.md
spec-lines: 200

files-read:

- PLAN.md (§8 on-call, §12 notifications, §16 roadmap, §19 open decisions)
- specs/04-oncall.md (§4a.3 states, §4a.4 confirm, §4a.9 boundaries), specs/10-notifications.md
- apps/api/src/db/schema.ts (`outbox`, `notificationPreferences`, `NOTIFICATION_EVENT_TYPES`)
- apps/api/src/notifications/outbox.ts (`enqueueOutbox`, `drainOutbox`)
- apps/api/src/oncall/confirm.ts (`CONFIRMABLE_STATES`)
- docs/DECISIONS.md, docs/DECISIONS/0019-channel-configuration-and-account-linking.md

files-write:

- specs/04-oncall.md (§4a.3, §4a.4, §4a.9), specs/10-notifications.md (§11.4, §11.5, §11.7, §11.10, §11.12, §11.14)
- docs/DECISIONS/0021-readiness-allocation-over-the-configured-channels.md, docs/DECISIONS.md
- PLAN.md (§8, §12, §16, §19), work-packages/README.md, CHANGELOG.md
- work-packages/m14/ (WP-M14-26 … WP-M14-32, each file in this commit; WP-M14-16 and WP-M14-17 name the seven event types)

interfaces:

- `oncall.assigned`, `oncall.swap_requested`, `oncall.unconfirmed_reminder` — the readiness
  event types of §11.4
- `outbox.event_type` (check over the seven types) and `outbox.shift_id` (FK `oncall_shifts`,
  cascade, nullable) — the shape ADR-0021 fixes for migration `0034`
- `DRAFT --technician confirm--> CONFIRMED` — the readiness acceptance of §4a.3
- the readiness selection rows of `/settings/notifications` (WP-M14-32)
- ADR-0021 (`docs/DECISIONS/0021-readiness-allocation-over-the-configured-channels.md`)

## Task

1. Fill the readiness rules into `specs/04-oncall.md`: a `DRAFT` shift is confirmable by its
   technician (§4a.3 state table and transition block, §4a.4 rule), the allocation of a
   technician and a swap request announce themselves through the outbox (§4a.4) and the
   boundary of §4a.9 names phase 14 as the place where readiness delivery happens.
2. Extend `specs/10-notifications.md`: the three readiness event types in the table of §11.4
   and in the precedence rule, the readiness message of §11.5, the shift row of §11.7
   (exactly one of `ticket_id` and `shift_id`), the data model of §11.10 (migration `0034`
   widens the `outbox` and the `notification_preferences` event check), the seven types in the
   selection of §11.12 and the readiness rule of §11.14.
3. Write ADR-0021 (the allocation notifies the technician over their selected channels, the
   outbox gains `event_type` and a nullable `shift_id`, a `DRAFT` readiness is confirmable, the
   reminder is one row per shift) and index it in `docs/DECISIONS.md`.
4. Update `PLAN.md` §8 (state machine and the readiness-notification rule), §12 (event types and
   message content), §16 (the status paragraph above) and §19 (the open readiness decision is
   resolved by ADR-0021); add the backlog rows of WP-M14-26 … WP-M14-32 and one changelog entry.
5. Announce the split: `27-readiness-notification-database-widening.md`,
   `28-readiness-message-and-outbox-shift-rows.md`, `29-readiness-allocation-enqueues-its-rows.md`,
   `30-draft-readiness-is-confirmable.md`, `31-unconfirmed-readiness-reminder.md` and
   `32-readiness-selection-in-the-settings-page.md` exist in this commit; amend the event-type
   lines of WP-M14-16 and WP-M14-17 to the seven types.

## Non-goals

- No schema, service, route, job, UI or test code — this package changes documents only.
- No change of the adapters of phase 7 and no new channel kind.
- No readiness entry in `notifications.minimum_channels` (§11.9 stays critical-ticket-only).
- No change of the ticket coupling: a `DRAFT` shift still never counts.

## Acceptance

```bash
npm run wp:check
npm run check
git grep -n "ADR-0021\|WP-M14-2[6-9]\|WP-M14-3[0-2]" -- docs specs PLAN.md work-packages
```

Expected: all green — `wp:check` reports the seven new documents valid; `check` is green because
no source file changes; the grep shows ADR-0021, the spec rules and the backlog documents.

## Handoff

- Files changed: the two spec slices, ADR-0021 and its index, PLAN.md, the backlog, the changelog,
  the seven new WP documents, the amended WP-M14-16/17 documents
- Interfaces added: the readiness event types, the outbox shape of ADR-0021, the confirmable `DRAFT`
- Verified:
- Follow-up WP: WP-M14-27 … WP-M14-32 (each file exists in this commit)
- Open question: none
