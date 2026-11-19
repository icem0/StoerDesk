# WP-M14-161d: the delivery problems name the cause in the interface language

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.8, §11.12
spec-lines: 40

depends-on: WP-M14-161b

files-read:

- apps/web/src/admin/delivery-page.tsx (the page of the delivery problems)
- apps/web/src/admin/__tests__/delivery-page.test.tsx (the test of the page)
- apps/web/src/i18n/locales/de/settings.json (`admin.channels.errors.*`, `admin.delivery.*`)
- apps/web/src/i18n/locales/de/common.json (`notifications.selection.events.*`)
- apps/api/src/notifications/channels/web-push.ts (the codes a web push fails with)
- apps/api/src/notifications/delivery.ts (the failures of the answer)

files-write:

- apps/web/src/admin/delivery-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/delivery-page.test.tsx, docs/REPO-MAP.md, CHANGELOG.md,
  work-packages/README.md, this document

interfaces:

- `DeliveryPage` — the page of the delivery problems at `/admin/delivery`
- `settings.delivery.failures.*` — the texts of the lost messages in `de` and `en`

## Task

**The lost message names its cause (the office, out of band in phase 14).**

1. `apps/web/src/admin/delivery-page.tsx` reads the event of a lost message from
   the `common` namespace (`notifications.selection.events.*`) instead of the
   namespace `notifications`, which does not exist — the row showed the raw
   machine code `ticket.created` instead of „Neuer Vorgang“. An event without
   a text keeps its machine value.
2. The reason of a failure no longer comes from the texts of the channel
   administration: those texts belong to the ntfy channel (`http_407`, „Prüfen
   Sie URL und Thema") and are wrong for every other channel. The delivery
   page gets its own texts under `admin.delivery.reasons.*` for the codes the
   channels really produce, and a fallback that names the unknown code
   instead of guessing.
3. The row shows the **machine code** of the failure next to the reason —
   §11.8 asks the admin to see „mit welchem Maschinencode", and the code is
   what the support needs.
4. The row is built as a card: channel, event, ticket and time in the first
   line, the reason and the code in the second, the attempts in the third.

## Non-goals

- No change of the API, of the contracts and of the quittature.
- No change of the channel administration and of the inbox.
- No retry of a lost message and no deletion of a failed row.
- No change of the failure text of the ticket history.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the translated event, the reason of
the code and the machine code of the row.

## Handoff

- Files changed: the page, the texts of the `settings` namespace, the test and
  the repository docs
- Interfaces added: the keys `settings.admin.delivery.reasons.*`,
  `settings.admin.delivery.failures.*`
- Verified: `npm run typecheck --workspaces --if-present`, `npm run lint`,
  `npm run test:run`, `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
