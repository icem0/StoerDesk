# WP-M1-10f: Traceable CI run, job and step names

format: small-model
status: done
depends-on: WP-M1-10e, WP-M0-05, WP-M1-10
phase: 1
context-budget: 18k tokens
spec: PLAN.md §16 (phase 1 exit criteria), §18 (quality gates); AGENTS.md "CI after push", "Conventions" (English, no PII); WP-M0-05 (`work-packages/m0/05-build-and-push.md`) for the image pipeline contract
spec-lines: 0

files-read:

- .github/workflows/check.yml
- .github/workflows/build.yml
- AGENTS.md
- CONTRIBUTING.md
- docs/REPO-MAP.md
- work-packages/README.md

files-write:

- .github/workflows/build.yml
- .github/workflows/check.yml
- AGENTS.md
- CONTRIBUTING.md

interfaces:

- workflow display names: `check` (file `check.yml`, unchanged trigger target) and
  `publish images` (file `build.yml`, formerly `build and push`)
- every workflow sets `run-name`: `check · <ref> · <event>` and
  `publish images · <event> · <source branch>`
- the `version` job renames its own run to `publish <version> · <short sha>` through
  `gh api --method PATCH /repos/{owner}/{repo}/actions/runs/{run_id}` and therefore
  needs `permissions: actions: write`
- job names: `Typecheck, Lint, Tests, i18n`, `Docker smoke test`, `Playwright (E2E)`,
  `Resolve version tag`, `Publish api image <version>`, `Publish web image <version>`
- no route, schema or script changes; image tags and the GHCR names stay identical

## Task

Every pipeline run in the Actions list is labelled `build and push`, and inside that
run the publish step is labelled `Build and push` as well, so a run says nothing about
which commit, which version or which images it produced. Make the runs and steps
self-describing without changing what they do.

1. `check.yml`: add `run-name: check · <ref> · <event>` where `<ref>` is
   `github.head_ref` for `pull_request` and `github.ref_name` otherwise. GitHub Actions
   has no `substring()` function, so the label carries no short SHA. Rename the two ambiguous step names:
   `Check` → `Quality gates (typecheck, lint, tests, i18n, wp)` and
   `Build` → `Build web and API artifacts (no publish)`.
2. `build.yml`: rename the workflow display name to `publish images` (file name stays
   `build.yml`), add `run-name: publish images · <event> · <ref>` and add
   `actions: write` to `permissions`.
3. `build.yml`: rename the `version` job to `Resolve version tag` and add a guarded step
   `Name the run after the version` that patches the run name to `publish <version>`
   with `gh api` (`continue-on-error: true`), so a missing permission cannot break it.
4. `build.yml`: name the publish job `Publish ${{ matrix.service }} image <version>`,
   rename the step `Build and push` to `Build and push image`, and append the image
   names, tags, version, source SHA and source run URL to `$GITHUB_STEP_SUMMARY` in a
   `Write image summary` step.
5. `AGENTS.md` "CI after push": state the naming rule — every workflow sets a `run-name`
   naming trigger, ref and short SHA, a publishing workflow renames its run to the
   published version, and the report to the user quotes the renamed run title, the
   version tag, the commit hash, the run URL and the conclusion.
   `CONTRIBUTING.md`: replace the `build and push` wording with `publish images`.

## Non-goals

- No change to the image names, the tag set (`<version>`, `<version without v>`,
  `sha-<sha>`, `latest` on `main`), the buildx cache or the Dockerfile targets.
- No change to the trigger contract: `publish images` still starts on a successful
  `check` run on `main` and on `workflow_dispatch` with a `version` input.
- No new secrets, no new third-party actions, no required-status configuration.
- No rewrite of historical WP documents, the `CHANGELOG.md` entries of WP-M0-05 or the
  status prose of `work-packages/README.md`.

## Acceptance

```bash
npx prettier --check .github/workflows/build.yml .github/workflows/check.yml AGENTS.md CONTRIBUTING.md
node -e "const y=require('js-yaml'),f=require('fs');for(const p of ['.github/workflows/build.yml','.github/workflows/check.yml']){y.load(f.readFileSync(p,'utf8'));console.log('parsed',p)}"
grep -c 'run-name' .github/workflows/check.yml .github/workflows/build.yml
npm run check
```

Expected: Prettier reports no reformat, both workflow files contain exactly one
`run-name`, `npm run check` is green, and the pushed commit's runs are labelled
`check · main · push` (with jobs, not a file-name run) and
`publish images · workflow_run · main`.

## Handoff

Split slice: the run labels landed first (`in-progress`), this commit closes the
rest; the WP is now done.

- Files changed (run labels): both workflow files, this document, `CHANGELOG.md`,
  `work-packages/README.md` and `PLAN.md` §16
- Interfaces added: the workflow display name `publish images` (was `build and push`) and
  `run-name` on both workflows; GHCR image names and the tag set are unchanged
- **GitHub Actions has no `substring()` function.** The first attempt wrote
  `${{ substring(github.sha, 0, 7) }}` into both `run-name:` blocks; that is not a valid
  expression, so the push produced four runs that failed instantly, named after the
  workflow _file_, with zero jobs (`v0.0.40`). YAML parsing passes anyway, so the command
  above does not catch it — only a real push proves a `run-name:`. The labels now carry
  no short SHA.
- Done in this completion: the job name `Publish <service> image <version>`, the step
  `Build and push image` and the `Write image summary` step (image names, tags, version,
  source SHA and source run URL in `$GITHUB_STEP_SUMMARY`); `AGENTS.md` states the
  run-naming rule and `CONTRIBUTING.md` speaks of `publish images`
- Deviation: the file stays `build.yml` although the display name is `publish images` —
  renaming the file would break the Actions history links
- **Correction by WP-M1-10h:** the `Name the run after the version` step added here together
  with `permissions: actions: write` never worked. GitHub has no REST endpoint that renames
  a run — a real `gh api --method PATCH /repos/<repo>/actions/runs/<run_id>` answers `404`,
  and the guard swallowed it in every run. Removed in WP-M1-10h, where the version reaches
  the label through the tag-push trigger and the inherited `run-name`.
- Follow-up WP: WP-M1-09c…WP-M1-09e, WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
