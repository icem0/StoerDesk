# WP-M5-12: close the missing event and error translations

format: small-model
status: done
depends-on: WP-M5-11
phase: 5
milestone: m5
context-budget: 18k tokens
spec: PLAN.md §3.1 (i18n mechanics, de/en parity)
spec-lines: 20

files-read:

- apps/api/src/db/schema.ts — `TICKET_STATUSES`, event names
- apps/api/src/tickets/internal-actions.ts, pauses.ts, escalation.ts, notifications/outbox.ts — event `type` values
- packages/shared/src/schemas/ticket.ts — public event subset, source values
- apps/web/src/features/tickets/ticket-email-page.tsx — source rendering
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json`

files-write:

- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/src/features/tickets/ticket-email-page.tsx
- work-packages/m5/12-localization-sweep.md (this file)

interfaces:

- every `ticket_events.type` the UI can render has a `status.events.*` label.
- `ticket-email-page.tsx` resolves `detail.source.*` with the lower-case key and a
  `defaultValue` fallback instead of emitting the bare key.

## Task

`i18n:check` only compares the de/en key sets, so it cannot see a key that is
missing in both languages. The UI rendered `status.events.comment` literally.

1. `ticket.json` de/en: add `status.events` labels for every event type the API
   writes — `comment`, `escalated`, `paused`, `resumed`, `notification_sent`,
   `notification_failed` (the transition events already exist).
2. `ticket-email-page.tsx`: the source column used `t(\`detail.source.${source}\`)`
   with the upper-case enum value (`QR`), but the keys are lower-case (`qr`).
   Lower-case the key and pass `defaultValue` so an unknown source never shows a
   raw i18n path.
3. Re-audit the other dynamic families (status values, priority, actor kind,
   ticket source, on-call state/swap/weekday, BMA status, API-key scopes, webhook
   event labels, dashboard tiles/on-call, deadline priorities/rules, statistics
   ranges/buckets/reaction phases, admin home modules/phases) — no further gap.

## Non-goals

- No new locale or namespace.
- No change to the API event names.
- No UI redesign.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; de/en stay symmetric.

## Handoff

- Files changed: `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`, `apps/web/src/features/tickets/ticket-email-page.tsx`
- Interfaces added: none
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (469 passed, 445 integration tests skipped without a database), `npm run i18n:check` (1071/1071), `npm run wp:check`, plus an enum audit of status values/events, priority, actor kinds, sources, on-call states, BMA status, API-key scopes, webhook labels, dashboard tiles, deadline rules, statistics and admin-home modules
- Follow-up WP: WP-M5-13 (`m5/13-settings-error-translations.md`)
- Open question: none
