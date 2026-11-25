# WP-M34-02b: The inbox names the release of the shift

format: ctx-128k
status: done
depends-on: WP-M34-02a
phase: 34
context-budget: 18k tokens
spec: specs/10-notifications.md §11.4, §11.18
spec-lines: 40
changed-lines: 60

files-read:

- specs/10-notifications.md (§11.4, §11.18)
- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/admin/delivery-page.tsx
- apps/web/src/i18n/locales/de/common.json

files-write:

- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/admin/delivery-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `inbox.task.oncallReleased` — the text of the task of a released shift
- `notifications.eventNames.oncall.released` — the name of the event

## Task

1. **The task of the inbox.** The inbox of the user composes the readable
   text of a task from the event type and its params (§11.18, ADR-0052). The
   event `oncall.released` names the pool and the cause of the release — the
   shift was deleted or handed over to another technician (`ADR-0058`).
2. **The protocol.** The page of the delivery lists the event types of §11.4;
   the release joins them.
3. **The texts.** `de` and `en` carry the text of the task, the two causes and
   the name of the event.
4. **The test.** The test of the inbox proves the text of the task and the
   link into the readiness.

## Non-goals

- No change of the page of the delivery beyond the list of the events.
- No channel and no notification of its own.

## Acceptance

Run and report the exact commands:

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected result: all green; the new test fails before the change and passes
after it.

## Handoff

- Files changed: `apps/web/src/features/notifications/inbox-page.tsx` (the
  text of the task of a released shift),
  `apps/web/src/features/notifications/__tests__/inbox-page.test.tsx` (the
  case of the release), `apps/web/src/admin/delivery-page.tsx` (the event joins
  the list of the protocol),
  `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json` (the
  text of the task, the two causes and the name of the event)
- Interfaces added: `inbox.task.oncallReleased` with `inbox.task.releasedDeleted`
  and `inbox.task.releasedReassigned`, `notifications.eventNames.oncall.released`
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the 619 cases of the web app run green — except the case of the
  wall display, which fails in the container of the session because its Node
  formats the German numbers with an English separator (the case fails on
  `HEAD` as well, the CI runs Node 22)
- Follow-up WP: none — the release of a shift is closed with this package.
- Open question: none
