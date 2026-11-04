# WP-M3-12: the documentation of the new update control

format: small-model
status: planned
depends-on: WP-M3-11
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/18-self-update.md §18.2–§18.7
spec-lines: 120

files-read:

- docs/DEPLOYMENT.md — the deployment paths of the host
- docs/REPO-MAP.md — the inventory of the modules
- PLAN.md §16 — the status history of the project
- work-packages/README.md — the backlog of record
- CHANGELOG.md — the history of the releases

files-write:

- docs/DEPLOYMENT.md
- docs/REPO-MAP.md
- PLAN.md
- work-packages/README.md

interfaces:

- the section `## Update` of `docs/DEPLOYMENT.md` — the webhook path
- the module table of `docs/REPO-MAP.md` — the new modules

## Task

The documentation must describe the update control that the code now has:

1. `docs/DEPLOYMENT.md`: the section about the update agent becomes the
   description of the update menu, the environment keys and the deploy webhook;
   the manual path of `scripts/update.sh` stays.
2. `docs/REPO-MAP.md`: the modules of the update control are listed once — the
   GitHub client, the routes, the installed version, the panel and the badge —
   and the agent disappears from the tree and from the module table.
3. `PLAN.md` §16: the status of the update work and the phase table are
   updated.
4. `work-packages/README.md`: the backlog table gets the rows of
   WP-M3-07 … WP-M3-12 with their status, and the status prose names the new
   update control.
5. `CHANGELOG.md`: the entry of the session.

## Non-goals

- No change of the code in this WP.
- No new decision: ADR-0007 is written in WP-M3-07.

## Acceptance

```bash
npm run check
```

Expected: all green; every module of the repository is listed exactly once in
`docs/REPO-MAP.md` and the tree matches the directories.

## Handoff

- Files changed: the deployment guide, the repository map, the plan, the
  backlog of record, the changelog
- Interfaces added: none
- Verified: pending
- Follow-up WP: none
- Open question: none
