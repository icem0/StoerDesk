# WP-M1-21: the promotion of `latest` is serialised per image

format: small-model
status: done
depends-on: WP-M1-18
phase: 1
context-budget: 12k tokens
spec: PLAN.md §18.3
spec-lines: 20

files-read:

- .github/workflows/build.yml
- PLAN.md

files-write:

- .github/workflows/build.yml

interfaces:

- `build.yml` job `Promote latest for <service>` — matrix `api`, `web`; needs
  `[version, publish]`; `if: always()`; job concurrency `latest-<service>` with
  `cancel-in-progress: false`
- `build.yml` job `Publish <service> image <version>` — no longer promotes `latest`; it
  writes the version tags only

## Task

WP-M1-18 moved `latest` out of the build into a promotion step, but that step still ran
inside the publish job of every version. Since a session with several commits publishes
several versions in parallel, two promotions of the same image can overlap: the older run
reads the registry before the newer version tag exists, finds the older version and writes
`latest` — after the newer run has already written the newer version. `latest` would then
point at an older version again.

The promotion moves into a job of its own, and the promotions of one image are serialised
by a concurrency group per image (`latest-<service>`). The read of the registry and the
write of `latest` therefore never interleave with another promotion of the same image, and
`latest` can only move forward. The api image and the web image have their own group, so
they never wait for each other.

1. `build.yml`: the publish job writes the version tags only; its summary lists them
   without `latest`.
2. `build.yml`: the new job `Promote latest for <service>` checks out the tags, logs into
   the registry, takes the highest version tag that exists there and points `latest` at it
   with `docker buildx imagetools create`; it writes the result into its job summary.
3. The job runs with `if: always()`, so a failed build of one image does not stop the
   promotion of the other image: every image gets `latest` = its newest published
   version.

## Non-goals

- No change to the image tags other than `latest`, no change to the run labels, no change
  to the check workflow.
- No back-fill of the versions whose images are missing.

## Acceptance

```bash
npm run check
npm run wp:check
node -e "const yaml=require('js-yaml');yaml.load(require('fs').readFileSync('.github/workflows/build.yml','utf8'))"
```

Expected: green. After the next tag push the publish run has the jobs
`Publish api image v0.0.NN`, `Publish web image v0.0.NN` and
`Promote latest for api` / `Promote latest for web`, and `latest` names the newest
published version.

## Handoff

- Files changed: `.github/workflows/build.yml` and the bookkeeping outside `files-write`
  (`CHANGELOG.md`, `PLAN.md` §16, `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: job `Promote latest for <service>`
- Verified: `npm run check` green locally; the overlap that motivated the job was read
  from the registry state of the runs `41437659116` (v0.0.100), `41437704147` (v0.0.101)
  and `41437661108` (v0.0.102), which published in parallel
- Follow-up WP: none
- Open question: none
