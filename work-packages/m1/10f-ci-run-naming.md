# WP-M1-10f: Traceable CI run, job and step names

format: small-model
status: in-progress
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
- every workflow sets `run-name`: `check · <ref> · <short sha> · <event>` and
  `publish images · <event> · <ref>`
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

1. `check.yml`: add `run-name: check · <ref> · <short sha> · <event>` where `<ref>` is
   `github.head_ref` for `pull_request` and `github.ref_name` otherwise, and
   `<short sha>` is `substring(github.sha, 0, 7)`. Rename the two ambiguous step names:
   `Check` → `Quality gates (typecheck, lint, tests, i18n, wp)` and
   `Build` → `Build web and API artifacts (no publish)`.
2. `build.yml`: rename the workflow display name to `publish images` (file name stays
   `build.yml`), add `run-name: publish images · <event> · <ref>` and add
   `actions: write` to `permissions`.
3. `build.yml`: rename the `version` job to `Resolve version tag` and add a step
   `Name the run after the version` that patches the run name to
   `publish <version> · <short sha>` with `gh api`, guarded by `continue-on-error: true`
   so a missing permission can never break the publish.
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
`run-name`, `npm run check` is green, and in the GitHub Actions UI of the pushed commit
the check run reads `check · main · <sha7> · push` while the publishing run is renamed
to `publish v0.0.N · <sha7>` with a job summary listing the pushed image tags.

## Handoff

Partial slice: status `in-progress`, the remainder is listed below and stays tracked.

- Files changed (this commit): `.github/workflows/check.yml` (`run-name`, two step
  names), `.github/workflows/build.yml` (display name `publish images`, `run-name`),
  this WP document, plus `CHANGELOG.md` and the `WP-M1-10f` row in
  `work-packages/README.md` and `PLAN.md` §16
- Interfaces added (this commit): workflow display name `publish images` (was
  `build and push`), `run-name` on both workflows; GHCR image names and the tag set are
  unchanged
- Not done yet in this WP:
  1. `build.yml`: `permissions: actions: write` and the `Name the run after the
version` step (`gh api --method PATCH`, run id path, `continue-on-error: true`)
  2. `build.yml`: job name `Publish <service> image <version>`, step rename
     `Build and push` → `Build and push image`, `Write image summary` step into
     `$GITHUB_STEP_SUMMARY`
  3. `AGENTS.md` "CI after push" naming rule and the `CONTRIBUTING.md` wording
- Verified (this commit): both workflow files parse as YAML (`js-yaml`), Prettier
  reports no reformat, `npm run check` is green; the executed proof of the run names is
  the CI run of this commit
- Deviation: the file stays `build.yml` although the display name is `publish images` —
  renaming the file would break the Actions history links
- Follow-up WP: the rest of WP-M1-10f (steps 1–3 above), then WP-M1-09b, WP-M1-09c,
  WP-M1-09d, WP-M1-09e, WP-M1-10d, WP-M1-11, WP-M1-12
- Open question: none
