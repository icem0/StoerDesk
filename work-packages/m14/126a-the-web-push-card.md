# WP-M14-126a: the web-push card

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: specs/10-notifications.md §11.1, §11.3, §11.12, §11.13; PLAN.md §12, §16
spec-lines: 18

depends-on: WP-M14-124, WP-M14-125

files-read:

- apps/web/src/features/settings/NtfySubscription.tsx (the QR card pattern)
- apps/web/src/lib/api.ts (`apiFetch`, `ApiError`)
- apps/web/src/i18n/locales/de/common.json and en (the notifications namespace)
- apps/web/src/features/settings/**tests**/ntfy-subscription.test.tsx (the render pattern)

files-write:

- apps/web/src/features/settings/WebPushSubscription.tsx
- apps/web/src/features/settings/**tests**/web-push-subscription.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `WebPushSubscription` is a self-contained card: it reads
  `GET /v1/notifications/accounts/webpush`, asks for the notification
  permission on click, subscribes with the VAPID public key and stores
  `{ endpoint, keys }` through `POST`; the remove button drops the local
  subscription and calls `DELETE`.
- A missing VAPID key, a browser without PushManager and a refused permission
  each name their own hint instead of offering a button that cannot work.
- `urlBase64ToUint8Array` and `subscriptionBody` are exported for the test.

## Task

The routes and the service worker exist, but the user has no way to subscribe.
This package adds the card itself; the page mounts it in WP-M14-126b.

1. Add `WebPushSubscription.tsx`: a react-query read of the config, a subscribe
   mutation (permission, `pushManager.subscribe`, `POST`), an unsubscribe
   mutation (`unsubscribe`, `DELETE`), the localized error text and a QR to the
   page for the phone (only while the channel is configured).
2. Export `urlBase64ToUint8Array` (url-safe base64 to the bytes of the key) and
   `subscriptionBody` (endpoint plus `p256dh`/`auth`) for the test.
3. Add the `notifications.webpush.*` keys in de and en (guidance, subscribe,
   remove, linked, device count, not configured, unsupported, QR, errors) and keep
   the key sets equal.
4. Add the component test: key decoding, request body, missing config, missing
   browser support and the happy path with a stubbed `serviceWorker`/`PushManager`.

## Non-goals

- No change of the API routes or the service worker (WP-M14-124/125).
- No mount on the settings page and no overview state — that is WP-M14-126b.
- No push permission prompt at render; only the click asks.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the component test proves the stored body and the three
states without a button.

## Handoff

- Files changed: the card, its test, the two locale files and this WP
- Interfaces added: the card, `urlBase64ToUint8Array`, `subscriptionBody`
- Verified: `npx vitest run apps/web/src/features/settings/__tests__/web-push-subscription.test.tsx`
- Follow-up WP: WP-M14-126b (mount the card on the settings page)
- Open question: none
