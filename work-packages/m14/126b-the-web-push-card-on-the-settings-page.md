# WP-M14-126b: the web-push card on the settings page

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.1, §11.4, §11.12; PLAN.md §12, §16
spec-lines: 14

depends-on: WP-M14-126a

files-read:

- apps/web/src/settings/notifications-page.tsx (the channel page and its sections)
- apps/web/src/features/settings/WebPushSubscription.tsx (the card of WP-M14-126a)

files-write:

- apps/web/src/settings/notifications-page.tsx

interfaces:

- The page mounts `<WebPushSubscription />` before the Matrix section and reads
  the same `['webpush-config']` query for the overview and the selection.
- While the config route answers no VAPID key the overview keeps `later`; once a
  key exists the state is `linked` with a device and `notLinked` without one.

## Task

The card of WP-M14-126a is not reachable yet, and the overview still names web
push as "follows in a later package". This package wires it in.

1. Import the card and mount it before the Matrix section.
2. Read `GET /v1/notifications/accounts/webpush` under the key
   `['webpush-config']` (react-query dedupes it with the card), derive the
   three-valued state and pass it to `channelState`; `channelLinked` returns true
   only for a configured channel with a device, so the selection checkbox follows
   the real state.

## Non-goals

- No change of the card, the locales or the API.
- No new query key and no second request for the same answer.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the existing page test still passes because an unconfigured
server keeps the channel `later` and renders no second QR.

## Handoff

- Files changed: the settings page and this WP
- Interfaces added: the mount of the card and the shared `['webpush-config']` key
- Verified: `npx vitest run apps/web/src/settings/__tests__/notifications-page.test.tsx`
- Follow-up WP: none
- Open question: none
