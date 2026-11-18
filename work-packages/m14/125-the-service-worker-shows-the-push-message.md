# WP-M14-125: the service worker shows the push message

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/10-notifications.md §11.1; PLAN.md §12, §16
spec-lines: 12

depends-on: WP-M14-124

files-read:

- apps/web/src/sw.ts (the injectManifest service worker)
- apps/api/src/notifications/channels/web-push.ts (the payload text)
- apps/web/src/**tests**/sw.test.ts (the existing service-worker tests)

files-write:

- apps/web/src/sw.ts
- apps/web/src/**tests**/sw.test.ts

interfaces:

- A `push` event shows a notification with the title of the first payload line,
  the rest as the body and `/logo.png` as the icon.
- The last payload block `<label>: <url>` is the deep link; the label is the
  translated `notification.action_label` of the server, so the parser never
  hard-codes a locale.
- A click closes the notification and focuses an open window of the app or opens
  the deep link; a payload without a url opens the app root.

## Task

The adapter of WP-M7-04 sends a text payload, but the service worker had no
`push` or `notificationclick` listener, so a browser subscription would receive
nothing visible. This package adds both.

1. Add `notificationFromPayload` to `apps/web/src/sw.ts`: first line title
   (fallback `StörDesk`), rest body, optional last block `<label>: <url>` as the
   deep link.
2. Add `focusOrOpen`: focus an already open window of the target, otherwise open
   it; an empty url opens `/`.
3. Register the `push` listener (showNotification with `data.url`) and the
   `notificationclick` listener (close, then `focusOrOpen`). Nothing is logged;
   the endpoint and the keys never enter this file.
4. Extend `apps/web/src/__tests__/sw.test.ts` with the parser, the deep-link
   focus, the open path and the empty-url fallback.

## Non-goals

- No subscribe button and no permission request — that is WP-M14-126.
- No change of the payload format in `channels/web-push.ts`.
- No notification permission prompt at load; the settings card asks on click.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the service-worker test proves the parser and the click
behaviour.

## Handoff

- Files changed: `apps/web/src/sw.ts` and its test
- Interfaces added: `notificationFromPayload`, `focusOrOpen`, the two listeners
- Verified: `npx vitest run apps/web/src/__tests__/sw.test.ts`
- Follow-up WP: WP-M14-126 (the web-push card on the settings page)
- Open question: none
