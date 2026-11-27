# WP-M31-13: the criterion and the documentation of the phase

format: ctx-256k
status: done
depends-on: WP-M31-12
phase: 31
milestone: m31
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.1–§19.12
spec-lines: 274
changed-lines: 320

files-read:

- specs/19-customer-portal.md (the slice of the phase)
- apps/api/src/customers/**tests**/portal.integration.spec.ts (the pattern of the test)
- docs/REPO-MAP.md (the module map)
- PLAN.md §16 (the phases and the status)
- CHANGELOG.md (the history of the changes)
- work-packages/README.md (the backlog of record)

files-write:

- apps/api/src/customers/**tests**/phase31-exit.integration.spec.ts
- docs/REPO-MAP.md
- PLAN.md
- CHANGELOG.md
- work-packages/README.md

interfaces:

- the criterion of the phase 31 — the customer registers, confirms himself over the link, logs in, sees his own open tickets and his own objects, and reaches no internal route of the office
- the module map carries the nine new modules of the phase

## Task

1. **The criterion** `apps/api/src/customers/__tests__/phase31-exit.integration.spec.ts`:
   the customer sees his own open ticket and his own objects, his account
   holds the role `customer`, and the internal routes of the office answer
   `403 forbidden` for him.
2. **The module map** `docs/REPO-MAP.md` carries the nine new modules — the
   service of the registration, the mails, the public routes, the routes of the
   portal, the assignments of the object and the four pages of the portal.
3. **The plan** `PLAN.md` §16 names the state of the phase.
4. **The changelog** `CHANGELOG.md` names the feature and its four decisions.
5. **The backlog** `work-packages/README.md` marks the packages of the phase as
   done.

## Non-goals

- No new feature and no new route.
- No change of the slice.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the criterion of the phase passes.

## Handoff

- Files changed: the criterion, the module map, the plan, the changelog and the
  backlog
- Interfaces added: the criterion of the phase 31
- Verified: the commands above
- Follow-up WP: none — the phase is closed
- Open question: none
