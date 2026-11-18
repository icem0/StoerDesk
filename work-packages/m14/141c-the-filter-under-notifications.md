# WP-M14-141c: the filter under `/notifications`

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.12, §11.16; PLAN.md §5, §14
spec-lines: 40

depends-on: WP-M14-141b

files-read:

- apps/web/src/features/notifications/inbox-page.tsx (the page of the inbox)
- apps/web/src/features/notifications/**tests**/inbox-page.test.tsx (the test of the page)
- apps/web/src/features/tickets/ticket-list-page.tsx (the filters in the URL)
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json (the texts)
- apps/web/src/auth/usePermission.ts (the permission in the web app)

files-write:

- apps/web/src/features/notifications/inbox-page.tsx
- apps/web/src/features/notifications/**tests**/inbox-page.test.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json

interfaces:

- `/notifications` — the filter block (addressee, channel, event, state, unread)
  appears only with the permission `notification.read_all`; the filters live in
  the query of the URL and the answer carries the addressee of every row

## Task

1. `inbox-page.tsx`: the page reads the permission with `usePermission`. Without
   `notification.read_all` the page stays exactly as it is — the own messages,
   the limit, the read receipt. With the permission the page adds the filter
   block above the list.
2. The filter block: the addressee (a list of the addressees of the answer with
   the number of their messages), the channel, the event, the state of the
   delivery and the checkbox "only unread". The values live in the query of the
   URL (`?userId=&channel=&eventType=&state=&unread=`), so a filtered view can
   be shared and the back button works.
3. The list: every row names its addressee in the admin mode. The read receipt
   stays a right of the own messages — a row of another user is not clickable.
4. The texts: the new keys of the namespace `common` in `de` and `en` — the
   labels of the filter, the "all" options, the addressee of a row and the
   number of the messages of an addressee. The labels of the channel and of the
   state come from the existing keys, the label of the event from
   `notifications.selection.events`.
5. The test: the filter block appears with the permission and stays away
   without it, the request carries the chosen filters, the row names the
   addressee and a foreign row takes no read receipt.

## Non-goals

- No new page and no entry in the menu: the filter lives on the page of the
  inbox.
- No change of the bell and of the unread count.
- No export of the filter and no saved view.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it;
`npm run i18n:check` proves the parity of `de` and `en`.

## Handoff

- Files changed: `apps/web/src/features/notifications/inbox-page.tsx`, the page
  test, the two locale files, this document, `work-packages/README.md`,
  `CHANGELOG.md`, `docs/REPO-MAP.md`, `PLAN.md` §16
- Interfaces added: the filter block of `/notifications` and its texts
- Verified: `npm run check`
- Follow-up WP: none
- Open question: none
