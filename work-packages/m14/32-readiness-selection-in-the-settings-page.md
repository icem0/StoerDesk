# WP-M14-32: The technician selects the channels of the readiness

format: small-model
status: planned
depends-on: WP-M14-17, WP-M14-29
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.4, §11.12 (ADR-0021), PLAN.md §14
spec-lines: 40

files-read:

- apps/web/src/settings/my-settings-page.tsx (the own channels page of WP-M14-10)
- apps/api/src/notifications/preferences.ts (the selection routes of WP-M14-16)
- apps/web/src/i18n/locales/de/settings.json and en/settings.json (the notification keys)
- apps/web/src/settings/__tests__/my-settings-page.test.tsx (the page test pattern)

files-write:

- apps/web/src/settings/my-settings-page.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json
- apps/web/src/settings/__tests__/readiness-selection.test.tsx

interfaces:

- the readiness block of `/settings/notifications` — one row per readiness event type with one
  checkbox per configured channel, saved through `PUT /api/v1/notifications/preferences`
- i18n keys `settings.notifications.events.oncall.assigned`,
  `settings.notifications.events.oncall.swap_requested` and
  `settings.notifications.events.oncall.unconfirmed_reminder` (de and en)

## Task

1. On the own channels page add the readiness block: the three readiness event types of §11.4 as
   their own rows, each offering one checkbox per configured channel (Telegram, ntfy, e-mail,
   …); saving writes the selection through `PUT /api/v1/notifications/preferences`.
2. Every text goes through `useTranslation('settings')` with the keys above; `de` and `en`
   gain the same keys (`Bereitschaft allocation`, `Swap request`, `Unconfirmed reminder` /
   `Readiness allocation`, `Swap requested`, `Unconfirmed shift reminder`).
3. `readiness-selection.test.tsx` (stubbed `fetch`, pattern of the settings page tests) asserts
   the three rows, the channel checkboxes, the write body shape and the German labels.
4. A user without a readiness row shows the block as "the channels of the instance" (the
   fallback of §11.4) and the block renders nothing for a channel that is not configured.

## Non-goals

- No API, schema or migration change — the selection routes of WP-M14-16 are reused.
- No readiness entry in the administration of the channels and no minimum-channel row.
- No change of the ticket event rows of WP-M14-17.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it; `de`/`en` parity.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: none
- Open question: none
