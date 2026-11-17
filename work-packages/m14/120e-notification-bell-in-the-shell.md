# WP-M14-120e: the bell in the shell with the number of the unread messages

format: small-model
status: planned
depends-on: WP-M14-120d
phase: 14
milestone: m14
context-budget: 16k tokens
spec: specs/10-notifications.md §11.8, §11.12; PLAN.md §14
spec-lines: 20

files-read:

- apps/web/src/components/Shell.tsx (the header of the application)
- apps/web/src/i18n/locales/{de,en}/common.json (the texts of the shell)

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/components/__tests__/Shell.test.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- The bell in the header next to the settings gear: it opens `/notifications`
  and shows the number of the unread messages of the session user.

## Task

1. Add the bell to the header of `apps/web/src/components/Shell.tsx`: a link to
   `/notifications` with the label of the inbox and the number of the unread
   messages as a badge. The badge is hidden without unread messages.
2. The number comes from `GET /api/v1/notifications/messages/unread-count` of
   WP-M14-120c; the query is refetched when the window regains the focus, so a
   message that arrives while the application is open shows up without a reload.
3. The bell stays hidden without a session — a reporter never sees it.
4. Add the localized texts of the bell in `de` and `en` and prove the bell in the
   test of the shell.

## Non-goals

- No push notification of the browser — the Web Push channel of §11.1 delivers
  the message itself.
- No sound and no vibration.
- No change of the inbox page of WP-M14-120d.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the bell shows the number of the unread messages and links
to the inbox.

## Handoff

- Files changed: the shell, its test, the two locale files
- Interfaces added: the bell in the header
- Verified: `npm run check`, `npm run build`
- Follow-up WP: none
- Open question: none
