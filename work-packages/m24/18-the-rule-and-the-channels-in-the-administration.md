# WP-M24-18: the rule and the channels of the users in the administration

format: small-model
status: done
depends-on: WP-M24-17
phase: 24
milestone: m24
context-budget: 14k tokens
spec: specs/10-notifications.md §11.9, §11.12, ADR-0045
spec-lines: 30

files-read:

- apps/web/src/admin/channels-page.tsx (the administration of the channels)
- apps/web/src/admin/users-page.tsx (the administration of the users)
- apps/api/src/settings/notifications.ts (the route of the rule)

files-write:

- apps/web/src/admin/channels-page.tsx, apps/web/src/admin/users-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `GET /v1/settings/notifications/channel-policy` — the rule of the administration
- `GET /v1/admin/notifications/compliance` — the channels of the users

## Task

1. The channel page holds the **rule of the administration**: the required
   channels (a checkbox per configured channel — `signal` is never offered, it
   has no address of a user) and the minimum number of set-up channels.
2. The channel page holds the **channels of the users**: every user with the
   symbol of his state and the required channels he does not have set up. The
   address of a user never appears (§11.13).
3. The user page carries a column with the state of the channels of the user.

The section of the mandatory channels of the critical tickets leaves with it —
the rule now applies to every user and every event.

## Non-goals

- No change of the API — WP-M24-04 and WP-M24-15.
- No blocking of a user — the rule warns.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the channel page, the user page, the labels
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-19 — the exit criterion of the phase
- Open question: none
