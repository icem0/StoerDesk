# WP-M3-03: the agent start command finds the project dir on the host

format: small-model
status: implemented
depends-on: WP-M2-72, WP-M2-74
phase: 3
milestone: m3
context-budget: 16k tokens
spec: specs/18-self-update.md §18.4
spec-lines: 40

files-read:

- apps/web/src/admin/update-host-update.tsx — the copy-paste start command
- specs/18-self-update.md (§18.4, §18.7)
- docs/DEPLOYMENT.md — the host update and the Arcane section
- docker-compose.yml — the required interpolation variables

files-write:

- apps/web/src/admin/update-host-update.tsx
- apps/web/src/admin/__tests__/update-host-update.test.tsx
- specs/18-self-update.md
- docs/DEPLOYMENT.md

interfaces:

- the start command shown on `/admin/update` (four lines of POSIX `sh`, no
  hard-coded path)
- no new API, env or flag

## Task

The start command of the admin page reads the project directory from the label
`com.docker.compose.project.working_dir` and `cd`s into it. That label holds the
path **of the machine that ran compose**. A panel such as Arcane runs compose
inside its own container, so the label says `/app/data/projects/<project>` while
the same folder sits on the host under the volume of the panel — the command
fails with `cd: ...: No such file or directory` even as root. Make the discovered
path the **host** path:

1. Keep the label as the first choice and accept it only when
   `docker-compose.yml` really exists there on the host.
2. Otherwise map the label path through the bind mounts of the running
   containers: for every container replace the longest mount `Destination` that
   prefixes the label path by its `Source` and keep the candidate that carries a
   `docker-compose.yml`. Arcane (`/app/data` → the `arcane_arcane-data` volume)
   and the same pattern in other panels resolve without a panel-specific path.
3. When no candidate has a compose file, stop with a clear message instead of
   running compose in the wrong directory; the operator `cd`s into the project
   folder themselves.
4. Keep the rest of the command (`-p "$PROJECT"`, `IMAGE_BUILD_CONTEXT`, the
   `update` profile, `--build`) exactly as it is, and state in the docs that the
   project `.env` is still interpolated by compose — with the panel keeping its
   variables in its own store, run the command with `--env-file` built from the
   environment of the running `api` container.

## Non-goals

- No code change in `apps/agent`: the agent keeps reading its own labels.
- No change of `scripts/update.sh`, which stays the path of a real checkout.
- No new agent start method (`docker run`, self-cloning checkout) — that would
  need its own WP.
- No change of the token handling, the profile or the image names.

## Acceptance

```bash
npm run typecheck -w @stoerdesk/web
npm run check
```

Expected: all green. The start guide test still finds the compose-project label,
the `--profile update up -d --build update-agent` line and the copy button, and
additionally the mount-mapping fallback of the command. On a host the command
needs no edit; the Arcane case is verified by the mapping rule, the real panel
run is operator work.

## Handoff

- Files changed: `apps/web/src/admin/update-host-update.tsx`, its test, the spec
  §18.4, `docs/DEPLOYMENT.md`, the changelog and the backlog tables
- Interfaces added: none — the start command text only
- Verified: `npm run check` (e2e skipped: no usable Chromium in this container)
- Follow-up WP: WP-M3-02b (`m3/02b-update-agent-image-hygiene.md`) — the agent
  still prunes by label only
- Corrected by: WP-M3-04 (`m3/04-agent-start-command-pins-project-dir.md`) — the
  label and the bind-mount mapping of this package were replaced by
  `--project-directory "$PWD"` plus the `.env` fill from the running `api`
- Open question: none
