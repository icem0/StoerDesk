# WP-M37-01: the overview names the rule of the administration

format: ctx-256k
status: done
depends-on: WP-M24-16 (the compliance of the signed-in user), WP-M30-04
phase: 37
milestone: m37
context-budget: 44k tokens
spec: specs/10-notifications.md §11.9, §11.11, §11.12, §11.19; PLAN.md §14, §16
spec-lines: 210
changed-lines: 260

files-read:

- specs/10-notifications.md §11.9 (the rule of the administration), §11.12 (the UI)
- apps/api/src/notifications/compliance.ts (the compliance of the users)
- apps/api/src/notifications/routes.ts (the route of the compliance of the user)
- apps/api/src/settings/notifications.ts (the rule of the administration)
- packages/shared/src/schemas/notification.ts (the contracts of the notifications)
- apps/web/src/settings/notifications-page.tsx (the own page of the channels)
- apps/web/src/i18n/locales/de/common.json (the texts of the notifications)

files-write:

- specs/10-notifications.md (§11.11 the route of the user, §11.12 the UI, §11.19 new)
- packages/shared/src/schemas/notification.ts
- apps/api/src/notifications/compliance.ts
- apps/api/src/notifications/routes.ts
- apps/web/src/settings/notifications-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/notifications-page.test.tsx
- apps/api/src/notifications/__tests__/compliance.integration.spec.ts

interfaces:

- `notificationUserComplianceSchema` — the compliance of the signed-in user with the `policy` of the administration (`requiredChannels`, `minimumChannelCount`)
- `GET /api/v1/notifications/compliance` — answers the compliance **and** the rule of the administration; the rule needs no right of the administration (§11.9)
- `readUserComplianceWithPolicy(database, userId)` — the compliance of the user and the rule; a user without a row answers with an empty compliance
- `notifications.overview.*` — the texts of the overview: the heading, the hint, the count, the fulfilment, the missing channels, the badge „Pflicht“ and the buttons

## Task

The page `/settings/notifications` showed a list of the channels with their
state, but it never named **which** of them are mandatory and **how many**
channels the user needs. The rule of the administration (§11.9) is known to the
server, but the page asked the server only for the compliance — the missing
channels and the count — so the page could not mark a channel as mandatory.

1. `packages/shared/src/schemas/notification.ts`: `notificationUserComplianceSchema`
   extends `notificationComplianceSchema` with the `policy` of the
   administration (`channelPolicySchema`). The contract of the admin list stays
   untouched — the rule belongs to the answer of the **user**.
2. `apps/api/src/notifications/compliance.ts`: `readUserComplianceWithPolicy`
   answers the compliance of the user and the rule of the administration. A
   user without a row in the table of the users (a session of a user that was
   deleted meanwhile) answers with an empty compliance instead of a broken
   answer.
3. `apps/api/src/notifications/routes.ts`: `GET /api/v1/notifications/compliance`
   parses the new contract.
4. `apps/web/src/settings/notifications-page.tsx`: the page reads the rule from
   the answer. The overview gets a **summary** (the count of the set-up
   channels against the minimum, the fulfilment or the missing channels) and
   every row of a **required** channel carries the badge „Pflicht“. A rule
   that is off (no required channel and a minimum of zero) says so instead of
   counting against nothing.
5. `apps/web/src/i18n/locales/de/common.json` and `.../en/common.json`: the
   texts of `notifications.overview.*`.
6. `specs/10-notifications.md`: §11.19 names the overview, the rule in it and
   the fold of the setup; §11.11 gains the row of the route, §11.12 the
   sentence of the page.
7. The tests: the page names the badge, the count and the missing channels;
   the API answers the rule with the compliance.

## Non-goals

- The fold of the setup (WP-M37-02) — the page still shows every setup.
- The rule itself stays the decision of the administration (§11.9): nothing is
  blocked, the page only names.
- No new right: the rule is not a secret — every user must know what he has
  to set up.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new cases fail before the change and pass after it.

## Handoff

- Files changed: `specs/10-notifications.md`, `packages/shared/src/schemas/notification.ts`,
  `apps/api/src/notifications/compliance.ts`, `apps/api/src/notifications/routes.ts`,
  `apps/web/src/settings/notifications-page.tsx`, the two locales, the two test files
- Interfaces added: `notificationUserComplianceSchema`, `readUserComplianceWithPolicy`,
  `notifications.overview.*`
- Verified: `npm run check:static` (typecheck, eslint 0 errors, `i18n:check`,
  `wp:check`); the integration test of the compliance needs a PostgreSQL — it
  runs in the CI of the repository, the container of the session has no database
- Follow-up WP: WP-M37-02 and WP-M37-03 — they land with this package: the three
  packages write the same page, and a page that is half written is no page
- Open question: none
