# WP-M1-10i: publish run label carries one line of "what is new"

format: small-model
status: done
depends-on: WP-M1-10h
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

- `check.yml` job `Dispatch publish run` — `POST /repos/<repo>/actions/workflows/build.yml/dispatches`
  with `ref`, `inputs.version`, `inputs.notes`, `inputs.source_run`, `inputs.mode=check`
- `build.yml` trigger — `workflow_dispatch` only; `workflow_run` is gone
- `build.yml` inputs — `version` (required), `notes`, `source_run`, `mode`
  (`check` | `manual`, default `manual`)
- `build.yml` `run-name` — `publish <version> · <notes>`, i.e. `publish v0.0.NN · <commit
subject>`; `publish <version> · manual · <ref>` when `notes` is empty
- `latest` moves only when `inputs.mode == 'check'`

## Task

WP-M1-10h proved that a run label is fixed when the run starts and that a tag push payload
carries the version but no short text: the `check` runs of `v0.0.49`/`v0.0.50` have
`head_sha` = the commit (`b13e9d4…`, `ca4c948…`) while the annotated tag objects are other
SHAs, so `github.event.head_commit.message` is the whole multiline commit message — body and
`Signed-off-by` trailer included. Actions expressions have no `split`, `substring` or
`replace`, so no expression can turn that into one line. A `workflow_run` payload carries
only the title of the calling run, which is why `publish v0.0.NN` was the most the publish
run could ever say.

The only payload that carries free text is a `workflow_dispatch` input, so the check run has
to hand the text over itself.

1. `check.yml`: add the job `publish-dispatch` (run name `Dispatch publish run`) with
   `needs: [check, docker-smoke]`, an `if` that keeps it on `push` events with both gates
   successful, and `permissions: actions: write`. It resolves the version tag at HEAD (must
   equal `github.ref_name`), takes the commit subject as the one-line note
   (`git log -1 --pretty=%s`, `tr`/`cut` to one line) and posts the dispatch with `jq` +
   `gh api`, then records the dispatch in its job summary.

2. `build.yml`: replace the `workflow_run` trigger with `workflow_dispatch` plus the inputs
   `version`, `notes`, `source_run` and `mode`; build `run-name` from `version` and `notes`;
   drop the event `if` of the version job and instead assert that the tag found at HEAD
   equals the requested `version`; gate `latest` on `mode == 'check'`; feed
   `inputs.source_run` and `inputs.notes` into the image job summary.

3. Both headers state why the label now comes from inputs, and AGENTS.md documents the new
   chain, the new titles and the `latest` rule.

4. No test file: workflow YAML is not executed by Vitest. Acceptance is the next push —
   the publish run of the next tag must be titled `publish v0.0.NN · <commit subject>`.

## Non-goals

- No change to the tag rules, the Husky hooks, the image tags other than `latest`, the
  `publish-queue` group or the required status check names.
- No rename attempt of any finished run (impossible), no back-fill for `v0.0.50`.
- No release notes, no CHANGELOG generation, no GHCR release object.

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: green, and after `git push --follow-tags` the `check` run is titled `v0.0.NN`,
its job `Dispatch publish run` is green, and the publish run starts as
`publish v0.0.NN · <commit subject>` with `Publish api image v0.0.NN` and
`Publish web image v0.0.NN`.

## Handoff

- Files changed: `.github/workflows/check.yml`, `.github/workflows/build.yml`, `AGENTS.md`
  and the bookkeeping outside `files-write` (`CHANGELOG.md`, `PLAN.md` §16,
  `docs/REPO-MAP.md`, `work-packages/README.md`)
- Interfaces added: dispatch-driven publish run with `version`/`notes`/`source_run`/`mode`
  inputs; version equality check in the publish run
- Verified: `npm run check` green locally; YAML parsed with `js-yaml`; the `head_sha` fact
  above read from the Actions API for runs `41036498730`/`41036613222` (`v0.0.49`) and the
  run of `v0.0.50`. CI proof (new run titles) is due with the next tag push.
- Accepted side effect: a publish run is no longer a `workflow_run` child of the check run;
  the link lives in the `source_run` input and both job summaries instead. A pull request
  run never dispatches (the `if` gates on `push`), so the empty `publish images` runs of
  WP-M1-10h are gone.
- Follow-up WP: WP-M1-10d, WP-M1-11, WP-M1-12 (existing documents)
- Open question: none
