# WP-M3-02: the host update removes the images it replaces

format: small-model
status: implemented
depends-on: WP-M2-72, WP-M2-73
phase: 3
milestone: m3
context-budget: 18k tokens
spec: specs/18-self-update.md §18.7
spec-lines: 60

files-read:

- scripts/update.sh — the current update and prune logic
- specs/18-self-update.md (§18.4, §18.7)
- docs/DEPLOYMENT.md — the host update section
- docker-compose.yml — the `image:` names and the build services
- work-packages/m2/72-host-update-shell-script.md — the original contract

files-write:

- scripts/update.sh
- specs/18-self-update.md
- docs/DEPLOYMENT.md
- docs/REPO-MAP.md

interfaces:

- `scripts/update.sh` with `--check`, `--yes`, `--cleanup`, `--gc`
- `own_names` / `own_patterns` / `own_ids` / `kept_ids` / `clean_images` in
  `scripts/update.sh` (shell functions, not exported)
- `STOERDESK_OWN_IMAGES` (the owned image names, default the three Compose
  `image:` names) and `STOERDESK_GC_UNTIL` (hours, default 168)

## Task

`docker compose up -d --build` moves the fixed `stoerdesk-{api,web,agent}:latest`
tags to the new images, so every previous image of this stack becomes tagless
(`<none>`). The only cleaner was `docker image prune -f --filter
label=com.docker.compose.project=<project>`, and that filter only finds a tagless
image when the **build** wrote the project label into the image. It does not for a
build from a remote context (`IMAGE_BUILD_CONTEXT`, the Arcane path), for the
`docker-compose` v1 fallback the script itself accepts, or for an aborted build —
so those images stayed on the host forever. Fix the cleanup, do not widen it:

1. Compute the images this deployment owns from its image **names**, not from
   labels: the three `image:` names of `docker-compose.yml` (overridable with
   `STOERDESK_OWN_IMAGES`) plus the Compose default name patterns
   `<project>-*` and `<project>_*` of older layouts.
2. `clean_images`: delete by image id every owned image that is neither the
   current image of one of the three names nor the image of a container of this
   compose project. `docker rmi` without `-f` — an image still held by a
   container is reported as kept, never forced away. Keep the project-labelled
   `docker image prune -f` as an additional best-effort step.
3. Never run an unscoped `docker image prune -f`: without a project the owned-name
   cleanup and the label prune are the whole cleanup, so images of other projects
   stay untouched (ADR-0006, §18.7).
4. Run the cleanup after the rebuild **and** after a failed rebuild, so an
   aborted build does not leave its new tagless image behind.
5. Add `--remove-orphans` to the rebuild, so containers of retired service names
   stop holding their images.
6. Add `--cleanup` (cleanup only, no version check, no pull, no build) and `--gc`
   (additionally `docker image prune -f --filter until=<n>h` and
   `docker builder prune -f --filter until=<n>h`, `<n>` from
   `STOERDESK_GC_UNTIL`, default 168) for the backlog an older version already
   left behind. State in the docs that `--gc` also removes tagless images of
   other projects older than the window.

## Non-goals

- No `docker image prune -a`, no deletion of a tagged image of another project.
- No change of the update agent (`apps/agent`): its identical prune moves to
  WP-M3-02b.
- No volume, network or container pruning; `pgdata`, `uploads`, `backups` and
  `update-state` are never touched.
- No change of the version comparison, the confirmation, the pull or the build
  context logic.

## Acceptance

```bash
sh -n scripts/update.sh
shellcheck scripts/update.sh
./scripts/update.sh --help
npm run wp:check
npm run check
```

Expected: all green. A mock-`docker` harness proves: an unlabelled tagless image
of a previous build is removed by id, the current `:latest` of each name and the
image of a running container are kept, an image a container still holds is
reported as kept and never forced, and no `docker image prune` runs without the
project filter. The real rebuild is host work and cannot run in this
development container (no Docker daemon).

## Handoff

- Files changed: `scripts/update.sh`, the spec §18.7, `docs/DEPLOYMENT.md`,
  `docs/REPO-MAP.md`, the changelog and the backlog tables
- Interfaces added: `--cleanup`, `--gc`, `STOERDESK_OWN_IMAGES`,
  `STOERDESK_GC_UNTIL`
- Verified: `sh -n`, `shellcheck`, `--help`, `--check`, the mock-`docker`
  harness; `npm run check`; the Docker rebuild/smoke gate stays unverified here
  (no Docker daemon, `PLAN.md` §18)
- Follow-up WP: WP-M3-02b (`m3/02b-update-agent-image-hygiene.md`) — the update
  agent has the same label-only prune
- Open question: none
