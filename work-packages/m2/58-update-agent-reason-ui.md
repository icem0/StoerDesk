# WP-M2-58: the page shows why the agent is not reachable

format: small-model
status: implemented
depends-on: WP-M2-57
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.4–§18.5
spec-lines: 130

files-read:

- apps/web/src/admin/update-host-update.tsx — the section of WP-M2-55
- packages/shared/src/schemas/update.ts — the reason codes of WP-M2-57
- apps/web/src/i18n/locales/de/settings.json — the German texts
- apps/web/src/i18n/locales/en/settings.json — the English texts
- docs/DEPLOYMENT.md — the operator steps the page names

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- the host update section names the reason why the agent is not reachable:
  no token, a wrong answer or the agent does not run — with the command that
  starts it

## Task

1. Show the reason of `agent.error` in the host update section:
   - `update_agent_not_configured` — the token `UPDATE_AGENT_TOKEN` is missing
     in the `.env` of the host,
   - `update_agent_bad_response` — the agent answered something invalid,
   - `update_agent_unreachable` — the agent does not run; the text names the
     command `docker compose --profile update up -d update-agent`.
2. Add the texts to the `settings` namespace (`admin.update.host.*`) in de and
   en, the same key set on both sides.
3. Extend the test: a missing agent with a reason shows the reason, not only
   "not reachable".

## Non-goals

- No change of the client-side update of stage 1.
- No automatic start of the agent: it stays opt-in, the socket is a host
  privilege.

## Acceptance

```bash
npm run check
```

Expected: typecheck, lint, tests, `i18n:check` (de and en complete) and
wp:check green.

## Handoff

- Files changed: the three files of `files-write` plus the test.
- Interfaces added: the i18n keys `admin.update.host.agentNotConfigured` and
  `admin.update.host.agentBadResponse`; the text of the missing agent names
  the command that starts it.
- Verified: `npm run check` green (353 tests, `i18n:check` 565 keys in de
  and en).
- Follow-up WP: none.
- Open question: none.
