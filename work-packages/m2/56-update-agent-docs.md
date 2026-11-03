# WP-M2-56: documentation of the host update

format: small-model
status: implemented
depends-on: WP-M2-55
phase: 2
context-budget: 14k tokens
spec: specs/18-self-update.md §18.4, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- docs/DEPLOYMENT.md — the deployment documentation
- docs/REPO-MAP.md — the module map
- CHANGELOG.md — the unreleased notes
- PLAN.md — §16 roadmap and backlog
- work-packages/README.md — the backlog of record
- docs/DECISIONS.md — the ADR index

files-write:

- docs/DEPLOYMENT.md
- docs/REPO-MAP.md
- CHANGELOG.md
- PLAN.md, work-packages/README.md — the backlog of record

interfaces:

- the documented deployment of the agent: `docker compose --profile update up
  -d update-agent`, the meaning of the env keys, the limits of the feature

## Task

1. `docs/DEPLOYMENT.md`: a section for the update agent — how to start it, what
   the mounts mean, that the socket is the only host privilege, that the run
   restarts the API and that the agent is not started by the normal deployment.
2. `docs/REPO-MAP.md`: the new modules (the agent workspace, the update routes,
   the update table) with their purpose and their public API; the file stays
   within 200 lines.
3. `CHANGELOG.md`: the unreleased notes for stage 2 — the agent, the routes,
   the permission, the table and the page section.
4. `PLAN.md` §16 and `work-packages/README.md`: the backlog rows of the stage-2
   chain with their final status.

## Non-goals

- No code change, no new ADR — ADR-0006 and the spec already describe the
  topology.
- No change of the stage-1 documentation.

## Acceptance

```bash
npm run check
```

Expected: the gates are green; `docs/REPO-MAP.md` has at most 200 lines; the
backlog of record lists every WP of the chain with its status.

## Handoff

- Files changed: the files of `files-write`.
- Interfaces added: none — documentation only.
- Verified: `npm run check` green; `docs/REPO-MAP.md` has exactly 200 lines with
  the new modules (the agent workspace, the admin API, the `update_runs` table
  and the shared schemas); the backlog of record lists every WP of the chain
  with its status.
- Follow-up WP: none — the stage-2 chain is closed.
- Open question: none.
