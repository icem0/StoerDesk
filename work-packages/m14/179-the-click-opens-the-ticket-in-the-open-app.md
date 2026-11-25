# WP-M14-179: the click on the pushed alarm opens the ticket in the open app

format: ctx-256k
status: done
depends-on: WP-M14-125 (the service worker shows the push message), WP-M22-01 (the service worker takes over at once)
phase: 14
milestone: m14
context-budget: 24k tokens
spec: specs/10-notifications.md §11.12 (the inbox is an alarm), PLAN.md §12 (Notifications)
spec-lines: 40
changed-lines: 120

files-read:

- apps/web/src/sw.ts — the push handlers of the service worker
- apps/web/src/__tests__/sw.test.ts — the test of the service worker
- specs/10-notifications.md — §11.12, the inbox as an alarm
- docs/REPO-MAP.md — the module table of the web app

files-write:

- apps/web/src/sw.ts — `focusOrOpen` and the click listener
- apps/web/src/__tests__/sw.test.ts — the test of the click
- specs/10-notifications.md — §11.12, the click on a pushed alarm
- work-packages/m14/179-the-click-opens-the-ticket-in-the-open-app.md — this file

interfaces:

- `focusOrOpen(clients: PushScope['clients'], url: string, origin: string): Promise<void>`
  — brings the running app to the front and navigates it to the deep link;
  opens a window only when the app is not open
- `PushClient.navigate(url: string): Promise<unknown>` — the navigation of an
  open window (a single-page application keeps the url of its document)

## Task

The click on a pushed alarm was answered with a new window every time.

`focusOrOpen` compared the whole url of an open window with the target:

- the target of a payload without a deep link is the **relative** path `/`,
  while the url of a window is always **absolute** — the comparison could never
  match;
- the app is a **single-page application**: the url of an open window is the url
  of the document that was loaded and never changes while the user navigates
  inside the app (MDN: "this technique is not suitable for SPAs").

Both together meant that the match failed on every click and
`clients.openWindow(target)` opened **another** top-level window. On Windows
that is a new window of the installed app with a process of its own — the
running app stayed on the old page, the user clicked again, and the browser
filled up with windows until it died.

1. `apps/web/src/sw.ts`: `focusOrOpen` takes the origin of the service worker
   as a third argument and resolves the target against it — a relative link
   becomes an absolute url of the app.
2. The window of the app is found by its **origin**, not by its url. A window
   that already shows the target is only brought to the front; every other
   window of the app is **navigated** to the target (`client.navigate`) — the
   ticket opens in the app that is already running.
3. A target of another origin (the `PWA_URL` of the installation points
   somewhere else) is opened as a window: a window of this origin cannot be
   navigated to a foreign url.
4. A refused `focus()` or `navigate()` falls back to the window — a click never
   ends without an answer.
5. `apps/web/src/__tests__/sw.test.ts`: the test of the click proves that the
   open window of the app is navigated instead of a second window opened, that
   the window of the app is opened when it is not open, that a link of another
   origin is opened and that the relative link of a payload without a deep link
   becomes the root of the app.
6. `specs/10-notifications.md` §11.12 names the behaviour: a click brings the
   running app to the front and opens the ticket in it.

## Non-goals

- No `tag` on the notification: a toast of the same ticket still stacks.
- No change of the payload, of the parser or of the push handler.
- No change of the API, of the database or of the channels.
- No i18n text — the change touches no visible text.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: `apps/web/src/sw.ts`, `apps/web/src/__tests__/sw.test.ts`,
  `specs/10-notifications.md`
- Interfaces changed: `focusOrOpen` takes the origin of the service worker as a
  third argument; `PushClient` knows `navigate`
- Verified: typecheck, lint, test:run, wp:check
- Follow-up WP: none — a remark: the notification carries no `tag`, so a toast
  of the same ticket stacks in the center of Windows; a tag per ticket would
  replace it and needs a line of §11.12
- Open question: none
