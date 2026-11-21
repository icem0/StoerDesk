# WP-M14-130: the health of the notification channels — ADR-0028, the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.8, §11.15; PLAN.md §12, §16
spec-lines: 40

depends-on: WP-M14-124, WP-M14-126b, WP-M14-128

files-read:

- specs/10-notifications.md (§11.1 the chain, §11.8 the status and the warning)
- apps/api/src/notifications/channels/web-push.ts (the adapter of WP-M7-09)
- apps/api/src/notifications/outbox.ts (the drain and the fallback of WP-M7-05)
- apps/api/src/db/schema.ts (the checks of the `outbox` table)

files-write:

- specs/10-notifications.md (§11.15)
- docs/DECISIONS.md, docs/DECISIONS/0028-the-channel-health-warning-goes-over-another-channel.md
- work-packages/m14/130a-…, work-packages/m14/130b-…, work-packages/m14/130c-…

interfaces:

- The error code `push_subscription_dead` — the push service answered `404` or
  `410` for an endpoint; the row of the outbox carries it as its `lastError`
- The event type `channel.health_warning` — the instance row of the warning
- `ADR-0028` — a broken channel warns over another channel, once a day

## Task

**The comment of the office (out of band in phase 14).** „gibt es die
möglichkeit den webpush täglich zu prüfen? und bei nichtfunktionieren eine
mitteilung über einen anderen kanal zu senden, dass die benachrichtigungsfunktion
gestört ist?" The web push has no status query: the only signal is the answer of
the push service to a real send. The decision of **ADR-0028** therefore splits
into three packages:

1. **WP-M14-130a** — the adapter names a dead subscription
   (`push_subscription_dead`) and the channel removes the row of
   `push_subscriptions`.
2. **WP-M14-130b** — the `outbox` table learns the instance row of the warning
   (migration `0049`): the event type `channel.health_warning` and a row
   without a ticket and without a shift.
3. **WP-M14-130c** — the daily check names the broken channels and enqueues the
   warning over the first other configured channel, once per day.

`specs/10-notifications.md` §11.15 carries the three rules; this package writes
no product code.

## Non-goals

- No daily test push into the browsers (ADR-0028, decision 1).
- No change of the fallback chain of a ticket notification.
- No change of the selection of the channels per event type (§11.4).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec slice and the ADR are in the repository and the
three child packages run in numeric order.

## Handoff

- Files changed: the spec slice, the ADR, the decision index and the three
  child packages
- Interfaces added: `push_subscription_dead`, `channel.health_warning`, ADR-0028
- Verified: `npm run check`, `npm run build`
- Follow-up WP: WP-M14-130a, WP-M14-130b, WP-M14-130c — every file exists in
  this commit and runs in numeric order
- Open question: none
