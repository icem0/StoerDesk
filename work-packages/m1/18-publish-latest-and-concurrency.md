# WP-M1-18: publish chain publishes every version and keeps `latest` at the newest one

format: small-model
status: done
depends-on: WP-M1-10i
phase: 1
context-budget: 22k tokens
spec: PLAN.md §18.3; AGENTS.md _CI after push_ and _Versioning (one tag per commit)_
spec-lines: 60

files-read:

- .github/workflows/build.yml
- .github/workflows/check.yml
- PLAN.md
- AGENTS.md
- docs/DEPLOYMENT.md

files-write:

- .github/workflows/build.yml
- .github/workflows/check.yml

interfaces:

- `build.yml` workflow concurrency — `group: publish-${{ inputs.version }}` (one group per
  version, `cancel-in-progress: false`)
- `build.yml` job `Publish <service> image <version>`, step `Promote latest to the newest
published version` — `docker buildx imagetools create --tag <image>:latest <image>:<newest>`
- image tags of a publish run — `v0.0.NN`, `0.0.NN`, `sha-<full sha>`; `latest` is no longer
  part of the build tags
- `check.yml` job `Typecheck, Lint, Tests, i18n`, step `Record the release context in the run
summary` — version, commit and subject of the checked tag in the job summary

## Task

Two defects of the publish chain are visible in the Actions list of the repository and are
fixed here.

1. A queued publish run was cancelled. All publish runs shared the concurrency group
   `publish-queue`. GitHub keeps only one pending run per group and cancels the previous
   pending one when a new run is queued, so the three dispatches of the session of
   2026-11-02 killed `publish v0.0.97` (run `41434311457`) and the dispatch of
   `v0.0.87` (run `41296126120`) died the same way. The images of both versions do not
   exist in GHCR. The group becomes one group per version, so no run can cancel another.

2. `latest` pointed to an older version. Every publish run wrote `latest`, and the run that
   finished last won: `publish v0.0.98` finished after `publish v0.0.99`, so `latest` is the
   digest of `v0.0.98` today. The build no longer writes `latest`; a new step reads the
   registry, takes the highest version tag that exists there and points `latest` at it with
   `docker buildx imagetools create`. An older build can therefore never move `latest`
   backwards, and a failed build leaves `latest` on the newest version that was really
   published.

3. `check.yml` writes version, commit and subject into the job summary of the check run, so
   the bare run title `v0.0.NN` in the run list can be resolved to the work package it
   belongs to.

## Non-goals

- No change to the tag rules, the Husky hooks, the run labels or the image tags other than
  `latest`.
- No back-fill of the versions whose images are missing; that is the repair run of
  WP-M1-19.
- No change to the deployment (Arcane builds from the source tree, `docs/DEPLOYMENT.md`).

## Acceptance

```bash
npm run check
npm run wp:check
node -e "const yaml=require('js-yaml');for (const f of ['.github/workflows/build.yml','.github/workflows/check.yml']) yaml.load(require('fs').readFileSync(f,'utf8'))"
```

Expected: green. After the next tag push the check run is titled `v0.0.NN`, the publish run
is titled `publish v0.0.NN · <commit subject>`, both `Publish api image v0.0.NN` and
`Publish web image v0.0.NN` are green and their summary names the version `latest` points
at.

## Handoff

- Files changed: `.github/workflows/build.yml`, `.github/workflows/check.yml` and the
  bookkeeping outside `files-write` (`CHANGELOG.md`, `PLAN.md` §16 and §18.3,
  `docs/REPO-MAP.md`, `AGENTS.md`, `work-packages/README.md`)
- Interfaces added: per-version publish concurrency group, `latest` promotion step, release
  context in the check job summary
- Verified: the two defects read from the Actions API (runs `41434311457`, `41434329548`,
  `41434295428`) and from the GHCR tag list — `latest` and `v0.0.98` share the digest
  `sha256:1b561cd4…`, `v0.0.99` has `sha256:4ae12ff0…`, and `v0.0.87`/`v0.0.97` are absent;
  the concurrency rule is documented by GitHub ("any previously pending job or workflow in
  the concurrency group will be canceled")
- Follow-up WP: WP-M1-19 (one tag per push, so every commit gets a check run)
- Open question: none
