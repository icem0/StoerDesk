# WP-M24-06f: the exit criterion names a channel the instance has

format: small-model
status: done
depends-on: WP-M24-06c
phase: 24
milestone: m24
context-budget: 6k tokens
spec: specs/10-notifications.md §11.9, §11.4
spec-lines: 20

files-read:

- apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts (the exit criterion)
- apps/api/src/settings/notifications.ts (the route of the rule of the administration)

files-write:

- apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts

interfaces:

- none — only the payload of the rule in the test changes

## Task

1. The probe „the rule of the administration does not decide the way of a
   message“ writes the rule with `requiredChannels: ['ntfy']` and expects
   `200`. The route refuses a required channel that the instance does not
   have with `422 invalid_request` (§11.9, WP-M24-04) — and the instance of
   the check run has no `ntfy` configured. The probe names `matrix`, the
   channel the environment of the test configures, and the message of the
   probe keeps its `ntfy` — the rule names a channel and the message goes over
   another one, which is what the probe proves.

## Non-goals

- No change of the route of the rule — the refusal of a channel the instance
  does not have stays.
- No change of the delivery.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the exit criterion writes the rule and gets `200`.

## Handoff

- Files changed: the exit criterion of phase 14
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: WP-M24-08 — the code over the channel confirms the account
- Open question: none
