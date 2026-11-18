# WP-M14-145: the card asks the server about this device

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.12
spec-lines: 20

depends-on: WP-M14-142, WP-M14-144

files-read:

- apps/web/src/features/settings/WebPushSubscription.tsx (the card of WP-M14-126a)
- apps/web/src/lib/web-push.ts (the probe of WP-M14-142)
- apps/web/src/i18n/locales/de/common.json (the texts of the card)
- specs/10-notifications.md §11.12

files-write:

- apps/web/src/features/settings/WebPushSubscription.tsx
- apps/web/src/features/settings/__tests__/web-push-subscription.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `POST /v1/notifications/accounts/webpush/check` with `{ endpoint }` — the
  question of WP-M14-144
- `notifications.webpush.notRegistered` (de/en) — the line of a device the
  browser holds and the server does not know

## Task

**The claim of the card.** „Dieses Gerät ist angemeldet.“ was the answer of the
card as soon as the browser held a subscription — even when the server had no
row for it and no push could ever arrive.

1. The card asks the server about the endpoint of this browser
   (`POST /v1/notifications/accounts/webpush/check`) and names the device as
   registered only while the server confirms it.
2. A device the browser holds and the server does not know gets its own line
   and the register action — the button registers the existing subscription
   again, no second permission prompt.
3. The device count of the account stays as it is.

## Non-goals

- No change of the API of WP-M14-144.
- No change of the inbox — it asks the server with WP-M14-146.
- No change of the texts of the other states.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the card names a device of the browser that the server
does not know.

## Handoff

- Files changed: the card, its test and the two locale files
- Interfaces added: the text of the device the server does not know
- Verified: —
- Follow-up WP: none
- Open question: none
