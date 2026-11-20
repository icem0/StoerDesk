# WP-M15-11: the web push card names an incomplete trio on its row

format: small-model
status: done
depends-on: WP-M15-10
phase: 15
milestone: m15
context-budget: 14k tokens
spec: specs/10-notifications.md §11.12
spec-lines: 12

files-read:

- apps/web/src/admin/channels-page.tsx (the card, the ntfy token hint of WP-M14-52)
- apps/api/src/notifications/config.ts (`webPushTrio` and the rule of WP-M14-170)
- docs/VAPID-SETUP.md (the diagnosis of an incomplete row)
- apps/web/src/i18n/locales/de/settings.json (the texts of the card)
- apps/web/src/i18n/locales/en/settings.json (the English counterpart)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the page test)

files-write:

- apps/web/src/admin/channels-page.tsx
- apps/web/src/i18n/locales/de/settings.json,
  apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/channels-page.test.tsx, specs/10-notifications.md,
  CHANGELOG.md, docs/REPO-MAP.md, work-packages/README.md, this document

interfaces:

- the card warns while the row of the web push is incomplete
  (`admin.channels.webpushIncompleteTrio`)

## Task

**The fault of the office (out of band in phase 15).** The web push of the
instance delivered nothing while the card looked fine. The VAPID trio is **one
value** (WP-M14-170): a row that carries only a part of the trio — a public key
without the private key, a Subject without a key — leaves the values of the
`.env` untouched, so the browser subscribed with the key of the row while the
server signed with the key of the environment and the push service refused every
send with `403`. The card showed the public key, said "Ein Geheimnis ist
gespeichert" and never named the state in between.

1. The card of `webpush` warns (amber, like the ntfy token hint of WP-M14-52)
   while the row is incomplete: the public key is there and no secret is stored,
   or a secret is stored without a public key. The text
   `admin.channels.webpushIncompleteTrio` names the effect: the values of the
   `.env` still apply beside the stored part, the trio must be saved together
   (one generated pair) or the row deleted.
2. The page test drives a web push card with a public key and no secret and
   expects the warning; a complete row (key plus secret) stays silent.

## Non-goals

- No change of `webPushTrio`, of `readWebPushConfiguration` or of any route: the
  rule of WP-M14-170 is right, the card only makes it visible.
- No chain change: a channel that exists only in the row of the administration
  stays a documented limitation (`docs/VAPID-SETUP.md`).
- No new machine code.

## Acceptance

```bash
npm run i18n:check
npm run test:run apps/web/src/admin/__tests__/channels-page.test.tsx
npm run check
```

Expected: green; an incomplete web push row is named on the card.

## Handoff

- Files changed: the page, the two locale files, the page test, the spec, the
  repository bookkeeping
- Interfaces added: `admin.channels.webpushIncompleteTrio`
- Verified: `npm run i18n:check`, the page test, `npm run check`
- Follow-up WP: none — the configuration feedback of the web push is closed
- Open question: none
