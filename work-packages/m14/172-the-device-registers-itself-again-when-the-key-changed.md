# WP-M14-172: the device registers itself again when the key of the server changed

format: small-model
status: done
depends-on: WP-M14-171
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.3
spec-lines: 26

files-read:

- apps/web/src/features/settings/WebPushSubscription.tsx (the card and the subscribe)
- apps/web/src/lib/web-push.ts (the probe of the browser)
- apps/web/src/features/settings/__tests__/web-push-subscription.test.tsx (the pattern)
- apps/web/src/lib/__tests__/web-push.test.ts (the probe test)
- apps/web/src/i18n/locales/de/common.json (`notifications.webpush.*`)
- specs/10-notifications.md (§11.3)

files-write:

- apps/web/src/lib/web-push.ts (the key of the subscription of the browser)
- apps/web/src/features/settings/WebPushSubscription.tsx (the card names and
  replaces the device of an older key pair)
- apps/web/src/i18n/locales/de/common.json,
  apps/web/src/i18n/locales/en/common.json (the text of the renewed key)
- apps/web/src/lib/__tests__/web-push.test.ts,
  apps/web/src/features/settings/__tests__/web-push-subscription.test.tsx,
  specs/10-notifications.md, CHANGELOG.md, docs/REPO-MAP.md,
  work-packages/README.md, this document

interfaces:

- `keyToBase64Url(buffer): string | null` — the key of a subscription as
  URL-safe base64
- the key of the browser in the answer of the probe (`BrowserPush.key`)
- the text `notifications.webpush.keyChanged` in `de` and `en`

## Task

**The fault of the office (out of band in phase 14).** After the server
renewed its VAPID keys, no push message arrived any more — and the user could
not repair it: the browser keeps the subscription of the old key pair, and
`subscribe()` returns the subscription it holds instead of a new one. The push
service refuses every send for a key pair the server does not own (`403`).

1. `apps/web/src/lib/web-push.ts` answers the **key of the subscription** of
   the browser next to its endpoint: `keyToBase64Url` turns the bytes of
   `applicationServerKey` into the URL-safe base64 the key of the server
   travels in. A browser that does not name its key claims nothing.
2. `apps/web/src/features/settings/WebPushSubscription.tsx` compares the key of
   the browser with the key of the server:
   - the card names the device — „Der Schlüssel des Servers wurde erneuert —
     dieses Gerät muss neu angemeldet werden." — and offers the registration
     instead of the calm „Dieses Gerät ist angemeldet.".
   - the registration removes the old device first: the subscription is
     unsubscribed in the browser and its endpoint is deleted on the server,
     then the device registers itself again with the key of the server. The old
     row would otherwise stay and the server would keep sending to it.
3. The tests prove the probe names the key of the browser, the card names the
   device of the older key pair and the registration replaces it.

## Non-goals

- No change of the API and no new route: the card uses the routes of
  WP-M14-124 as they are.
- No change of the service worker and no change of the notification itself.
- No removal of a device the browser cannot judge: a subscription without a
  named key stays as it is.
- No change of the inbox hint — the settings card is the place where a device
  is registered.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/lib/web-push.ts`,
  `apps/web/src/features/settings/WebPushSubscription.tsx`, the two `common.json`
  locale files, the two tests, `specs/10-notifications.md` §11.3,
  `CHANGELOG.md`, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: `keyToBase64Url`, the key of the browser in the answer of
  the probe, the text `notifications.webpush.keyChanged`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: WP-M14-173 — the operator guide names the diagnosis of the web
  push
- Open question: none
