# WP-M14-142: the browser answers for its own push subscription

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.1, §11.3, §11.12
spec-lines: 20

depends-on: WP-M14-126a, WP-M14-128

files-read:

- apps/web/src/features/settings/WebPushSubscription.tsx (the card of WP-M14-126a)
- apps/web/src/features/notifications/inbox-page.tsx (the inbox of WP-M14-120d)
- apps/web/src/lib/api.ts (the fetch helper of the web app)
- specs/10-notifications.md §11.1, §11.3, §11.12

files-write:

- apps/web/src/lib/web-push.ts
- apps/web/src/lib/__tests__/web-push.test.ts
- apps/web/src/features/settings/WebPushSubscription.tsx
- apps/web/src/features/settings/__tests__/web-push-subscription.test.tsx

interfaces:

- `pushSupported(): boolean` — whether this browser can subscribe at all
- `readBrowserPush(): Promise<BrowserPush>` — the state of this browser and the
  endpoint of its own subscription
- `useBrowserPush(): { push: BrowserPush | null; refresh: () => void }` — the
  probe as a hook; `null` while the browser has not answered
- `BrowserPushState` (`unsupported`, `denied`, `subscribed`, `not_subscribed`,
  `unknown`), `BrowserPush`

## Task

**The complaint of the office.** The UI of the push claimed a state of the
browser that nobody had checked: the card says „Dieses Gerät ist angemeldet.“
after one local subscription, and the inbox says „Push notifications are not
enabled in this browser yet.“ from the device count of the account. Both are
wrong whenever the browser and the server disagree — and the browser was never
asked at all.

1. Add the module `apps/web/src/lib/web-push.ts`: one probe that asks **this**
   browser for its own push subscription and names the state it found —
   `unsupported` (no `PushManager`, no service worker), `denied` (the
   notifications of the site are blocked), `subscribed` (this browser holds a
   subscription), `not_subscribed` (it could, but it is not registered) and
   `unknown` (the browser did not answer — nothing is claimed then). The
   registration is read with `getRegistration()`, not with `ready`: a browser
   without a registration has no subscription, while `ready` would wait for a
   registration that never comes.
2. The card of the settings page reads the probe instead of its own
   `pushSupported()` and its own effect on `navigator.serviceWorker.ready`: the
   device is named as registered only while the browser says so, a blocked
   permission gets its own line, and the remove action takes the endpoint from
   the probe.
3. Add the unit test of the probe (five states) and the tests of the card for
   the device the browser holds and for the blocked permission.

## Non-goals

- No change of the API of WP-M14-124 — the server side of the question comes
  with WP-M14-144.
- No change of the inbox page — it asks the browser with WP-M14-143.
- No change of the texts of the card.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the probe answers the five states and the card names the
device of the browser.

## Handoff

- Files changed: the probe, its test, the card and its test
- Interfaces added: `pushSupported`, `readBrowserPush`, `useBrowserPush`,
  `BrowserPushState`, `BrowserPush`
- Verified: `npm run check` (exit 0), the two vitest files of the package
- Follow-up WP: WP-M14-143 (the inbox asks this browser) — the document exists
  in this commit
- Open question: none
