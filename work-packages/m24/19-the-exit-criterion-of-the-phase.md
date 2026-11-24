# WP-M24-19: the exit criterion of the phase

format: small-model
status: done
depends-on: WP-M24-18
phase: 24
milestone: m24
context-budget: 16k tokens
spec: specs/10-notifications.md §11.3a, §11.4, §11.9, §11.11
spec-lines: 50

files-read:

- apps/api/src/notifications/__tests__/phase14-exit.integration.spec.ts (the criterion of phase 14)
- apps/api/src/notifications/__tests__/confirmation.integration.spec.ts (the confirmation of a channel)
- apps/api/src/notifications/__tests__/compliance.integration.spec.ts (the compliance of the users)

files-write:

- apps/api/src/notifications/__tests__/phase24-exit.integration.spec.ts
- docs/REPO-MAP.md, PLAN.md, work-packages/README.md

interfaces:

- the exit criterion of phase 24 — the rules of §11.4, §11.9 and §11.3a in one test

## Task

1. Write the exit criterion of the phase: the message goes over the confirmed
   channels of the recipient, a user without a confirmed channel gets the chain
   of the installation, the code over the channel confirms the account and the
   rule of the administration names the missing channels.
2. Update the roadmap of `PLAN.md`, the module map of `docs/REPO-MAP.md` and the
   backlog table of `work-packages/README.md`.

## Non-goals

- No change of the code of the layer.
- No new feature.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the criterion proves the rules of the phase.

## Handoff

- Files changed: the criterion, the plan, the module map, the backlog
- Interfaces added: none
- Verified: the commands above
- Follow-up WP: none — phase 24 is closed
- Open question: none
