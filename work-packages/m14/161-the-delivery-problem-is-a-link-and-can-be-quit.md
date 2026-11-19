# WP-M14-161: the delivery problem is a link and can be quit — the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 18k tokens
spec: specs/10-notifications.md §11.8, §11.11, §11.12
spec-lines: 80

depends-on: WP-M14-160

files-read:

- specs/10-notifications.md (§11.8 the status and the warning, §11.12 the UI)
- apps/web/src/settings/settings-page.tsx (the badge of the settings menu)
- apps/web/src/admin/channels-page.tsx (the failing channels of §11.12)
- apps/api/src/notifications/routes.ts (the status route of §11.8)
- apps/api/src/dashboard/service.ts (`resolveChannelStatus`, the tile)
- packages/shared/src/schemas/notification.ts (the contracts of the channels)

files-write:

- specs/10-notifications.md (§11.8 the quittature, §11.11 the two routes, §11.12 the page)
- work-packages/m14/161b-the-page-of-the-delivery-problems.md,
  work-packages/m14/161c-the-badge-of-the-settings-menu-is-the-link.md
- work-packages/README.md, PLAN.md §16, CHANGELOG.md, docs/REPO-MAP.md, this document

interfaces:

- `GET /api/v1/notifications/delivery` — the delivery problems and the lost messages
- `POST /api/v1/notifications/delivery/acknowledge` — the quittature of the problems
- `/admin/delivery` — the page of the delivery problems
- `app.channelWarning.badge` — the badge of the settings menu, a link to the page

## Task

**The office asked (out of band in phase 14).** „wenn es eine anzeige gibt wie
Zustellung gestört (1) … dann muss das ein link sein zu einer seite, auf der ein
admin das problem erkennen kann und das problem dort auch quittieren kann … wenn
das problem gelöst ist und die folgenden meldungen ankommen, dann muss auch
diese fehlermeldung wieder quittierbar gemacht werden“.

The badge of the settings menu counts the channels with failed rows of the
outbox — and it never goes away: a single failure of the past keeps the badge
red forever, and the badge is a text without a destination. The office wants
three things:

1. the badge **is a link** to a page where the admin sees the problem,
2. the admin can **quit** the problem there,
3. a failure **after** the quittature opens the problem again — a solved problem
   stays solved and a new one is never silent.

The rule and its contract:

- a failed delivery is a problem until somebody acknowledges it; the
  acknowledgement stores the **time** of the quittature, so every failure after
  that time is a new failure,
- the acknowledgement belongs to the instance (`settings` row
  `notifications.delivery_acknowledged`, one entry per channel) and not to a
  user; the user that acknowledged is named next to the time,
- `notification.write` quits a problem, `notification.read` reads the problems,
- the quittature never deletes a failed row: a message that never arrived stays
  lost and stays visible.

The package is split into three children, because the API, the page and the
badge touch three layers and the file limit of `PLAN.md` §17 is three to four
source files:

- **WP-M14-161a** — the contracts, the service `delivery.ts` and the two routes.
- **WP-M14-161b** — the page `/admin/delivery` and its texts.
- **WP-M14-161c** — the badge of the settings menu becomes the link and the
  menu gains the entry.

## Non-goals

- No change of the adapters, of the drain worker and of the escalation chain.
- No retry of a lost message and no deletion of a failed row.
- No change of the tile of the dashboard: it stays the raw state of the outbox.
- No new table and no migration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the three children run in the numeric order.

## Handoff

- Files changed: the spec §11.8, §11.11 and §11.12, the two child documents and
  the repository docs
- Interfaces added: the two routes and the page of §11.12
- Verified: `npm run wp:check`
- Follow-up WP: WP-M14-161a, WP-M14-161b, WP-M14-161c
- Open question: none
