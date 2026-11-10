# WP-M5-15: render history actors as name or "Extern: name"

format: small-model
status: done
depends-on: WP-M5-14
phase: 5
milestone: m5
context-budget: 14k tokens
spec: PLAN.md §3 (user-facing text), §3.1 (i18n mechanics)
spec-lines: 15

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx — timeline actor line
- apps/web/src/i18n/locales/de/ticket.json and `en/ticket.json` — `actorKind`, `detail`
- packages/shared/src/schemas/ticket.ts — `actorKind`, `actorName`

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- work-packages/m5/15-history-actor-rendering.md (this file)

interfaces:

- a user event shows only the full name (fallback `detail.field.unknown`), no
  `actorKind.user` prefix and no e-mail.
- a public event shows `detail.actor.external` with the supplied reporter name.
- a system event keeps `actorKind.system`.

## Task

1. Replace the `actorKind` + ` (name)` line in the timeline:
   - `user` → `event.actorName ?? t('detail.field.unknown')`
   - `public` → `t('detail.actor.external', { name: event.actorName ?? t('detail.field.unknown') })`
   - otherwise → `t(\`actorKind.${event.actorKind}\`)`
2. Add `detail.actor.external` = `Extern: {{name}}` (de) and
   `External: {{name}}` (en).
3. Leave the event title lookup untouched; `status.events.escalated` already
   exists in both locales (WP-M5-12) — if it still renders raw, the served build
   is stale.

## Non-goals

- No API change (WP-M5-14).
- No change to the comment body rendering.
- No new locale.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck -w @stoerdesk/web
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected result: all green; de/en stay symmetric.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: `detail.actor.external`
- Verified: `npm run typecheck -w @stoerdesk/web`, `npm run lint` (0 errors, 7 pre-existing warnings), `npm run test:run` (469 passed, 445 integration tests skipped without a database), `npm run i18n:check` (1072/1072), `npm run wp:check`
- Follow-up WP: none
- Open question: none
