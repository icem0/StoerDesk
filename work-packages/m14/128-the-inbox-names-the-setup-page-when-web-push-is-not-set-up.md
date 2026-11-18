# WP-M14-128: the inbox names the setup page when web push is not set up

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 14k tokens
spec: specs/10-notifications.md §11.1, §11.12; PLAN.md §12, §14
spec-lines: 14

depends-on: WP-M14-127, WP-M14-124, WP-M14-126b

files-read:

- apps/web/src/features/notifications/inbox-page.tsx (the inbox page of WP-M14-120d)
- apps/web/src/settings/notifications-page.tsx (the web-push state of WP-M14-126b)
- apps/web/src/features/settings/WebPushSubscription.tsx (the card and its key)
- packages/shared/src/schemas/notification.ts (the `WebPushConfigResponse` contract)
- apps/web/src/i18n/locales/de/common.json (the inbox texts)

files-write:

- apps/web/src/features/notifications/inbox-page.tsx, apps/web/src/features/notifications/__tests__/inbox-page.test.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- The inbox reads `GET /v1/notifications/accounts/webpush` under the shared
  query key `['webpush-config']` (react-query dedupes it with the card of
  WP-M14-126a — no second request).
- `inbox.webpushSetup` (de/en) — the link text of the setup hint; the link
  points to `/settings/notifications`, the entry of the settings menu that owns
  the web-push card.

## Task

**The comment of the office (out of band in phase 14).** „… und wenn das
not eingerichtet ischt gleich unter notifications einen link zur passenden
einrichtungsseite im menü.“ Web push exists end to end (WP-M14-124 … WP-M14-126b)
but is invisible on the inbox page: a user who never registered this browser
sees no way to it.

1. Import `WebPushConfigResponse` from `@stoerdesk/shared` and read
   `GET /v1/notifications/accounts/webpush` under `['webpush-config']`.
2. When the answer carries no VAPID key or no device of this user, show one
   line below the messages: a link to `/settings/notifications` with the text
   of `inbox.webpushSetup`. A configured channel with a device shows nothing
   extra.
3. A failed or pending config query shows no hint and no error line — the
   inbox never blocks on the channel state.
4. Add `inbox.webpushSetup` in `de` and `en`; no literal string in the page.

## Non-goals

- No change of the card, of the settings page or of the API of WP-M14-124.
- No subscribe action on the inbox page — registering stays on the settings
  page.
- No link to `/admin/channels` (that is the administration, WP-M14-54).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the inbox page test shows the setup link without a device
and without a key, and no link with a device.

## Handoff

- Files changed: the inbox page, its test, the two locale files and this WP
- Interfaces added: the shared `['webpush-config']` key on the inbox page and
  the setup link
- Verified: `npx vitest run apps/web/src/features/notifications/__tests__/inbox-page.test.tsx`,
  `npm run i18n:check`
- Follow-up WP: none
- Open question: none
