# WP-M24-16: the own page names the channels of the user (retroactive record)

format: small-model
status: done (retroactive record — the commit `f58d1450` landed on 2026-11-24 with the
subject `feat(web): WP-M24-16 the own page names the channels of the user` and named the
work package in its subject, but the document of the package was never written; the record
adds no behaviour, it states what the commit did and which announcement it closed)
depends-on: WP-M24-15
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.3a, §11.9, §11.11, §11.12
spec-lines: 40

files-read:

- apps/web/src/settings/notifications-page.tsx — the own page of the channels
- apps/api/src/notifications/accounts.ts — the accounts of the user with their state
- apps/api/src/notifications/compliance.ts — the compliance of the signed-in user (WP-M24-15)
- specs/10-notifications.md §11.3a, §11.9, §11.12 — the contract of the own page
- work-packages/m24/15-the-compliance-of-the-users.md — the announcement of this package

files-write:

- work-packages/m24/16-the-own-page-names-the-channels-of-the-user.md — this record
- work-packages/README.md — the row of the package in the backlog of record

interfaces:

- none new — the commit read the answer of `GET /api/v1/notifications/accounts`
  (WP-M24-05) and of `GET /api/v1/notifications/compliance` (WP-M24-15); it
  added no route

## Task (what commit `f58d1450` actually did)

1. **The own page names every channel with its state.** The state of a channel
   comes from the server: the answer of `GET /api/v1/notifications/accounts`
   carries the state of every account — `ready` (linked **and** confirmed),
   `linked` (linked, never confirmed) or `missing` (no account) — and a
   channel without an account is missing. The web push counts as set up when
   the browser has a device on the server; `signal` is a channel of the
   installation and has no state of its own. The page guesses nothing any more
   (ADR-0045).
2. **The state is readable without the colour.** Every state carries a symbol
   (`✓` ready, `●` linked, `○` missing) beside the colour — the state is never
   conveyed by the colour alone (`PLAN.md` §14).
3. **The button sends the one-time code over the channel itself** and the
   field of the code confirms it (§11.3a) — the confirmation travels over the
   channel it proves.
4. **The warning of the rule of the administration** stands on the own page
   with the link to the setup: the user who does not fulfil the rule
   (`notifications.required_channels`, `notifications.minimum_channel_count`)
   sees the missing channels.
5. The texts of the page in `de/common.json` and `en/common.json`, the test of
   the page in `apps/web/src/settings/__tests__/notifications-page.test.tsx`
   and the accent test of the browser in `apps/web/e2e/accent.spec.ts`.

## Non-goals

- No change of the API — the routes of the accounts and of the compliance
  exist (WP-M24-05, WP-M24-15).
- No confirmation of the account — the code over the channel is WP-M24-08.
- No change of the delivery.

## Acceptance

```bash
npm run wp:check
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
```

Expected: all green; the record changes no behaviour, so no test changes its
result.

## Handoff

- Files changed: this record and the row of the package in the backlog of
  record
- Interfaces added: none — the routes of the commit are named above
- Verified: `npm run check` green
- Deviation: the commit landed with the WP id in its subject and without the
  document of the package — the reason this record was written
- Follow-up WP: none — the announcement of WP-M24-15 is closed by this record
- Open question: none
