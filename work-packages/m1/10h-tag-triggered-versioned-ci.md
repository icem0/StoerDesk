# WP-M1-10h: version-tag-triggered CI with honest run names

format: small-model
status: done
depends-on: WP-M1-10g
phase: 1
context-budget: 20k tokens
spec: AGENTS.md _CI after push_ and _Versioning (one tag per commit)_; PLAN.md §16
spec-lines: 0

files-read:

- .github/workflows/check.yml
- .github/workflows/build.yml
- AGENTS.md

files-write:

- .github/workflows/check.yml
- .github/workflows/build.yml
- AGENTS.md

interfaces:

- `check.yml` trigger — `push: tags: ['v[0-9]*']` plus `pull_request` and
  `workflow_dispatch`; the `push: branches: [main]` trigger is gone
- `check.yml` `run-name` — `github.ref_name`, so a version run is titled `v0.0.NN`
  from the first second (`check · <head_ref> · pull_request` for PR runs)
- `build.yml` trigger — `workflow_run` on the `check` workflow without a branch
  filter (a tag run has the tag as its source ref), gated per job on
  `github.event.workflow_run.event == 'push'`
- `build.yml` `run-name` — `publish <display_title of the calling check run>`, i.e.
  `publish v0.0.NN`; `publish images · dispatch · <ref> · <version>` for a manual run
- no run is ever renamed: GitHub has no REST endpoint for it

## Task

WP-M1-10f and WP-M1-10g assumed a run could rename itself with
`PATCH /repos/<repo>/actions/runs/<run_id>`. That endpoint does not exist — the REST
reference for workflow runs lists only rerun, cancel, delete, logs, approvals and timing,
and a real call answers `404`. Both rename steps were dead code behind
`continue-on-error: true`, and `build.yml` now labels its runs `publish check · main · push · main`.

The label of a run is fixed by `run-name` when the run starts. The payload carries a
version only for a tag push (`github.ref_name`), and `git push --follow-tags` pushes the
annotated tag of every commit anyway. So the pipeline moves onto the tag.

1. `check.yml`: replace `push: branches: [main]` with `push: tags: ['v[0-9]*']`, set
   `run-name` to `github.ref_name` (falling back to the PR form for `pull_request`), and
   delete the dead `Resolve version tag` job plus the `actions: write` permission.

2. `build.yml`: drop the `branches: [main]` filter of the `workflow_run` trigger, add
   `github.event.workflow_run.event == 'push'` to the `if` of the version job (PR runs
   must not publish), and build the run label from
   `github.event.workflow_run.display_title`.

3. `build.yml` keeps resolving the version from the git tags of
   `github.event.workflow_run.head_sha` — that path is proven in CI and rejects a tag
   that does not point at the triggering commit.

4. `AGENTS.md`: state that a run name can never be changed after the start, that the
   main pipeline is triggered by the version tag push, and that a commit without a tag
   therefore gets no `main` CI run — which is why the one-tag-per-commit rule is a
   build precondition, not only a release niceness.

5. No test file: workflow YAML is not executed by Vitest. Acceptance is the next push.

## Non-goals

- No polling for the check run of a SHA, no merge of the two workflows.
- No change to the image tags, the `publish-queue` group, the required status check
  names or the `docker-smoke` job.
- No back-fill rename of the already finished runs (impossible anyway).

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: green, and after `git push --follow-tags` the `check` run of the new commit is
titled `v0.0.NN` and its publish run `publish v0.0.NN` — without any rename step.

## Handoff

- Files changed: `.github/workflows/check.yml`, `.github/workflows/build.yml`, `AGENTS.md`
  and the bookkeeping outside `files-write` (`CHANGELOG.md`, `PLAN.md` §16,
  `docs/REPO-MAP.md`, `CONTRIBUTING.md`, `work-packages/README.md`, plus the status
  corrections in `10f-ci-run-naming.md` and `10g-versioned-run-names.md`)
- Interfaces added: tag-push trigger for the quality gates, version-carried run labels
- Deviation: WP-M1-10g is overtaken — its rename job was dead code (no such REST
  endpoint); its document is marked accordingly
- Verified: run `v0.0.49` (`https://github.com/icem0/StoerDesk/actions/runs/41036498730`,
  `head_branch: v0.0.49`) and its publish run `publish v0.0.49`
  (`https://github.com/icem0/StoerDesk/actions/runs/41036613222`, jobs
  `Resolve version tag`, `Publish api image v0.0.49`, `Publish web image v0.0.49`) are both
  green for commit `b13e9d4`; the required status check `Typecheck, Lint, Tests, i18n` is
  reported on the commit although the run was started by the tag push
- Accepted side effect: `workflow_run` also fires for finished `pull_request` runs of the
  `check` workflow, so those produce a `publish images` run with every job skipped — the
  version job gates them out, no image is built
- Follow-up WP: WP-M1-09e (`09e-login-form-guard.md`), WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
