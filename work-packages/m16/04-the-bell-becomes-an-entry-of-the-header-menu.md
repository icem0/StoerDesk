# WP-M16-04: the bell becomes an entry of the header menu

format: small-model
status: done
depends-on: WP-M16-03
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.5; PLAN.md §14, §16 phase 16
spec-lines: 50

files-read:

- apps/web/src/components/Shell.tsx (the header, the nav, the action cluster)
- apps/web/src/components/notification-bell.tsx (the badge, the link)
- apps/web/src/components/__tests__/shell.test.tsx (the menu assertions)
- apps/web/src/components/__tests__/notification-bell.test.tsx (the bell assertions)

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/notification-bell.tsx
- apps/web/src/components/__tests__/shell.test.tsx
- apps/web/src/components/__tests__/notification-bell.test.tsx

interfaces:

- the header menu holds four entries: tickets, statistics, readiness, inbox
- the bell keeps the badge of WP-M14-120e and the link to `/notifications`
- the action cluster of the header holds the version and the settings gear only

## Task

1. `notification-bell.tsx` becomes the styling of a **menu entry**: the same
   shape as the entries of the menu (`min-h-11`, rounded, the accent classes of
   WP-M16-03), the bell icon, the label `app.inbox` and the badge of the unread
   messages above the icon — `99+` above ninety-nine, no badge when every
   message is read.
2. `Shell.tsx` renders the bell inside the `<nav>` right after the readiness
   entry, so the internal user finds tickets, statistics, readiness and the
   inbox in one row, and the tab strip on a phone scrolls through all four. The
   action cluster keeps the version and the settings gear only.
3. The bell stays hidden while the session is anonymous, as the menu entries of
   the guarded shell do today.
4. The tests prove the position: the bell link sits inside the nav element
   after the readiness link, it carries the badge, and the settings gear is no
   longer next to the bell. The assertions of the badge and of the link target
   stay.

## Non-goals

- No new menu entry and no new label: `app.inbox` names the entry already.
- No change of the unread count, of the inbox page or of its read marks.
- No change of the theme, of the accent ramp or of the mobile classes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new position assertions fail before the change and pass
after it.

## Handoff

- Files changed: `apps/web/src/components/Shell.tsx`, `apps/web/src/components/notification-bell.tsx`,
  the two test files of the shell and of the bell
- Interfaces added: the inbox as the fourth entry of the header menu (tickets, statistics,
  readiness, inbox), the badge of WP-M14-120e on a menu entry, the action cluster of the
  header keeps version and gear only
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run wp:check`
- Follow-up WP: WP-M16-05 (the mobile shell and the exit criterion) — the file
  exists in the commit of the split
- Open question: none
