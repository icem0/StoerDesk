# WP-M14-141: the admin sees which message arrived at which user — the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: specs/10-notifications.md §11.8, §11.11, §11.12; specs/01-rbac.md §3.3, §3.4; PLAN.md §5, §12
spec-lines: 80

depends-on: WP-M14-134

files-read:

- specs/10-notifications.md (§11.8 the status, §11.11 the API, §11.12 the UI)
- specs/01-rbac.md (§3.3 the matrix, §3.4 the catalog)
- apps/api/src/notifications/routes.ts (the routes of the inbox)
- packages/shared/src/permissions.ts (the catalog of the permission keys)
- packages/shared/src/schemas/notification.ts (the contracts of the messages)
- apps/web/src/features/notifications/inbox-page.tsx (the page of the inbox)

files-write:

- specs/10-notifications.md (§11.16 the admin view of the inbox)
- specs/01-rbac.md (§3.3 the matrix, §3.4 the catalog)
- PLAN.md (§5 the permission categories, §16 the current state)
- work-packages/m14/141-…, 141a-…, 141b-…, 141c-…

interfaces:

- `notification.read_all` — the right to read the messages of **other** users;
  the key belongs to no default role, `admin` holds it through the catalog and
  every other role takes it over the role API (`specs/01-rbac.md` §3.8)
- `GET /api/v1/notifications/messages` — the filters `userId`, `channel`,
  `eventType`, `state` and `unread`; without the permission the answer stays the
  own messages and a foreign `userId` answers `403 forbidden`
- `NotificationMessageItem.recipient` — `{ userId, name }` of the addressee,
  `null` without the permission
- `NotificationMessageListResponse.recipients` — the addressees of the answer
  with the number of their messages

## Task

**The comment of the office (out of band in phase 14).** „die notifikation soll
nur auf meine eigenen nachrichten reagieren … unter /notifications können wir
aber einen filter einbauen mit dem ein Admin sehen kann welche nachrichten bei
welchen benutzern angekommen sind … mit einer eigenen berechtigungs ebene die
einer rolle zugewiesen werden kann".

The inbox of a user stays personal: it shows and counts **only the own
messages** — that is the promise of the bell and of the page. The office asks
for a second view on the same page: a filter that shows which message arrived
at which user, for a role that may see it.

The decision splits into three packages:

1. **WP-M14-141a** — the permission key `notification.read_all` and the shared
   contracts of the filter.
2. **WP-M14-141b** — the API: the filters behind the permission.
3. **WP-M14-141c** — the web app: the filter under `/notifications`.

This package writes no product code.

## Non-goals

- No new notification event type and no new channel: the filter reads the
  messages that the internal layer already records (`notification_messages`).
- No change of the delivery: who receives a message stays the rule of §11.4.
- No deletion and no export of the messages.
- No change of the bell: the unread count stays personal.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the spec slice and the three child documents are in the
repository.

## Handoff

- Files changed: the two spec slices, `PLAN.md` §5/§16, this document and the
  three child documents
- Interfaces added: `notification.read_all`, the filters of the message list
- Verified: `npm run check` (exit 0), `npm run wp:check`
- Follow-up WP: WP-M14-141a, WP-M14-141b, WP-M14-141c (every document exists in
  this commit)
- Open question: none
