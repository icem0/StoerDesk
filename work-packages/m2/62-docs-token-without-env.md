# WP-M2-62: the documentation of the token without the environment

format: small-model
status: implemented
depends-on: WP-M2-61
phase: 2
context-budget: 12k tokens
spec: specs/18-self-update.md §18.5, docs/DECISIONS/0006-host-update-agent.md
spec-lines: 130

files-read:

- docs/DEPLOYMENT.md — the section of the update agent
- .env.example — the template of the environment
- specs/18-self-update.md — §18.5 the credential rule
- docs/DECISIONS/0006-host-update-agent.md — the credential rule of the ADR
- docs/REPO-MAP.md — the module map

files-write:

- docs/DEPLOYMENT.md
- .env.example
- specs/18-self-update.md
- docs/DECISIONS/0006-host-update-agent.md

interfaces:

- the documented credential rule: the bearer is created by the agent and lives
  in the state volume; `UPDATE_AGENT_TOKEN` in `.env` is optional

## Task

1. `docs/DEPLOYMENT.md`: the section of the update agent says that the bearer
   is created by the agent and that no secret has to be configured; the
   administration shows the command that starts the agent.
2. `.env.example`: the token is optional and only pins a fixed bearer.
3. `specs/18-self-update.md` §18.5 and `docs/DECISIONS/0006-host-update-agent.md`:
   the credential rule follows — the bearer is a random shared secret, created
   by the agent and read by the API from the state volume, never logged, never
   in a payload or a run row, never committed.
4. `docs/REPO-MAP.md`: the agent module carries the token file, the client of
   the API reads it; the file stays at 200 lines.

## Non-goals

- No code change.
- No change of the update itself.

## Acceptance

```bash
npm run check
```

Expected: the gates are green; `docs/REPO-MAP.md` has at most 200 lines.

## Handoff

- Files changed: the four files of `files-write`.
- Interfaces added: none — documentation only.
- Verified: `npm run check` green (360 tests).
- Follow-up WP: none.
- Open question: none.
