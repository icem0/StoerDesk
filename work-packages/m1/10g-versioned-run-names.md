# WP-M1-10g: versioned CI run names for the publish chain

format: small-model
status: done
depends-on: WP-M1-10f
phase: 1
context-budget: 20k tokens
spec: AGENTS.md _CI after push_ (run naming); PLAN.md §16; WP-M1-10f handoff
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

- `check.yml` job `Resolve version tag` — renames its **own** run to the exact
  `vMAJOR.MINOR.PATCH` tag at HEAD (the token of a `push`-triggered run is writable)
- `build.yml` `run-name` — `publish <title of the calling check run> · <head_branch>`, so an
  automatic publish run starts as `publish v0.0.47 · main`
- `build.yml` `workflow_dispatch` `run-name` — `publish images · dispatch · <ref> · <version>`
  from `inputs.version`; the rename step of WP-M1-10f is removed
- run labels never contain a SHA, an e-mail or a secret (GitHub expressions have no
  `substring()`)

## Task

WP-M1-10f assumed the publish run could rename itself to `publish <version>`. It cannot:
every `workflow_run`-triggered run gets a read-only `GITHUB_TOKEN` that `permissions:`
cannot elevate, so the guarded rename step swallows a `403` and all automatic publish runs
carry the same static label. The version has to enter the label where the token **is**
writable — the `check` run — and be inherited from there.

1. `check.yml`: add workflow-level `permissions: { contents: read, actions: write }` and a
   job `Resolve version tag` (parallel to `check`, `if: github.event_name != 'pull_request'`)
   that checks out with `fetch-depth: 0` and `fetch-tags: true`, resolves
   `git tag --points-at HEAD` to the highest `vMAJOR.MINOR.PATCH` and PATCHes
   `/repos/<repo>/actions/runs/<GITHUB_RUN_ID>` with `name=<version>` through `gh api`.
   Without a tag it writes a note and exits `0`; the step is `continue-on-error: true`, and
   the required status check keeps its job name `Typecheck, Lint, Tests, i18n`.

2. `build.yml`: replace the static `run-name` with a folded expression: on
   `workflow_run` → `format('publish {0} · {1}', github.event.workflow_run.display_title,
github.event.workflow_run.head_branch)`; otherwise → `format('publish images · dispatch ·
{0} · {1}', github.ref_name, github.event.inputs.version)`.

3. `build.yml`: delete the now dead step `Name the run after the version` and the
   `actions: write` permission, and rewrite the comment: the version comes from the calling
   check run, and job names plus job summaries stay the second carrier.

4. `AGENTS.md`: rewrite the run-naming bullet — check runs carry the version tag as their
   title, publish runs inherit it, and the reason (read-only token on `workflow_run`)
   replaces the old "only `workflow_dispatch` can rename" wording.

5. No test file: workflow YAML is not executed by Vitest. The acceptance is the next push —
   `check` shows as `v0.0.NN` and `publish images` starts as `publish v0.0.NN · main`; both
   runs and their job names are reported to the user.

## Non-goals

- No merge of the `check` and `publish images` workflows, no change to the image tags, the
  `publish-queue` concurrency group or the GHCR login.
- No new required status checks, no change to the `docker-smoke` job.
- No short SHA in any label (no `substring()` in GitHub Actions expressions).

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: green (the workflows are YAML-only changes), and after `git push --follow-tags`
the next `check` run is named `v0.0.NN` while its publish run starts as
`publish v0.0.NN · main`.

## Handoff

- Files changed: `.github/workflows/check.yml`, `.github/workflows/build.yml`, `AGENTS.md`
  and the bookkeeping outside `files-write` (`CHANGELOG.md`, `PLAN.md` §16,
  `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: `check.yml` job `Resolve version tag`, the inherited `run-name` of
  `build.yml`
- Deviation from WP-M1-10f: that package's rename step in `build.yml` never worked for
  automatic runs (read-only `GITHUB_TOKEN` on `workflow_run` triggers) and is removed
- Verified: pending — the naming only proves itself on the next push
- Follow-up WP: WP-M1-09e (`09e-login-form-guard.md`), WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: whether `workflow_run.display_title` in the event payload follows the API
  rename — if the publish run still shows `publish check · main · push`, switch the
  expression to `github.event.workflow_run.name`
