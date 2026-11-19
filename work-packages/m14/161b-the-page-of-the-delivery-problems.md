# WP-M14-161b: the page of the delivery problems

format: small-model
status: planned
phase: 14
milestone: m14
context-budget: 22k tokens
spec: specs/10-notifications.md §11.8, §11.12
spec-lines: 40

depends-on: WP-M14-161a

files-read:

- apps/web/src/admin/channels-page.tsx (the failing channels, the reason of a code)
- apps/web/src/routes/index.tsx (the route table of the administration)
- apps/web/src/i18n/locales/de/settings.json (`admin.channels.*`)
- apps/web/src/admin/__tests__/channels-page.test.tsx (the pattern of the test)
- apps/web/src/lib/api.ts (`apiFetch` and `ApiError`)

files-write:

- apps/web/src/admin/delivery-page.tsx, apps/web/src/routes/index.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json
- apps/web/src/admin/__tests__/delivery-page.test.tsx,
  docs/REPO-MAP.md, PLAN.md §16, CHANGELOG.md, work-packages/README.md, this document

interfaces:

- `DeliveryPage` — the page of the delivery problems at `/admin/delivery`
- `settings.delivery.*` — the texts of the page in `de` and `en`

## Task

**The page where the admin sees the problem and quits it (WP-M14-161).**

1. `apps/web/src/admin/delivery-page.tsx` (`DeliveryPage`) reads
   `GET /api/v1/notifications/delivery` behind `notification.read` and shows
   every channel with failed deliveries: the channel, the number of the failed
   deliveries, the number of the unacknowledged ones, the time of the last
   failure, the machine code of the last failure and the time of the last
   success. An acknowledged problem names the time and the user that
   acknowledged it.
2. The page lists the lost messages — the failed rows of the outbox: the time,
   the channel, the event, the number of the attempts, the machine code and the
   ticket the message announced (a link to the ticket).
3. `notification.write` offers the quittature: a button per open problem and a
   button for all open problems. The write goes to
   `POST /api/v1/notifications/delivery/acknowledge`; the answer is shown and
   the list is read again.
4. The page links to the channel administration `/admin/channels` — the problem
   is usually a wrong topic, a missing secret or an unreachable server.
5. `apps/web/src/routes/index.tsx` registers the route behind `RequireSession`;
   the texts live in the `settings` namespace in `de` and `en`.

## Non-goals

- No change of the channel administration and no change of the inbox.
- No retry of a lost message and no deletion of a failed row.
- No filter and no pagination: the answer carries the fifty newest failures.
- No change of the tile of the dashboard.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test proves the problems, the lost messages, the
guarded quittature and the answer of the write.

## Handoff

- Files changed: the page, the route table, the texts of the `settings`
  namespace, the test and the repository docs
- Interfaces added: `DeliveryPage`, the route `/admin/delivery`, the keys
  `settings.delivery.*`
- Verified: (fill after the gates run)
- Follow-up WP: WP-M14-161c (the badge of the settings menu becomes the link)
- Open question: none
