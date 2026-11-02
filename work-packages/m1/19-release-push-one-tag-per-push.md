# WP-M1-19: one tag per push, so every commit gets its own check run

format: small-model
status: done
depends-on: WP-M1-18
phase: 1
context-budget: 14k tokens
spec: PLAN.md §18.3; AGENTS.md _Versioning (one tag per commit)_
spec-lines: 20

files-read:

- scripts/version-file.mjs
- .husky/post-commit
- package.json
- PLAN.md
- AGENTS.md

files-write:

- scripts/push-release.mjs
- package.json
- .husky/post-commit

interfaces:

- `npm run release:push` — pushes the current branch and every version tag the remote
  does not have yet, one tag per push; `node scripts/push-release.mjs <remote>` with
  `origin` as default
- `.husky/post-commit` hint — `run 'npm run release:push' to share it`

## Task

GitHub documents a hard limit for tag pushes: "Events will not be created for tags when
more than three tags are pushed at once". The session of 2026-11-02 pushed seven tags in
one `git push --follow-tags`; GitHub created the push events for the last three of them
only, so the versions `v0.0.93`, `v0.0.94` and `v0.0.95` have **no** check run at all
(no run, no job, no check suite) and therefore no published images. The tags exist on the
remote; the quality gates simply never saw them.

1. Add `scripts/push-release.mjs`: it pushes the current branch first and then every
   local version tag the remote does not have, **one tag per `git push`**, so every tag
   creates its own push event and therefore its own check run. A tag whose commit is not
   contained in the pushed branch is skipped with a note; a tag of an already published
   version is not pushed again. The script never force-pushes and never prints a secret.
2. Register the script in the root `package.json` as `npm run release:push`.
3. Change the hint of `.husky/post-commit` to the new command, because
   `git push --follow-tags` is the command that caused the gap.

## Non-goals

- No change to the tag rules, the version rules, the workflow files or the run labels.
- No back-fill of the missing check runs of `v0.0.93` … `v0.0.95`; a manual dispatch
  covers them.
- No new npm dependency.

## Acceptance

```bash
npm run check
npm run wp:check
node --check scripts/push-release.mjs
```

Expected: green. `npm run release:push` against a test remote with four local tags and
no remote tag pushes four times, one tag per push, and a second run reports that the
remote has every version.

## Handoff

- Files changed: `scripts/push-release.mjs`, `package.json`, `.husky/post-commit` and the
  bookkeeping outside `files-write` (`CHANGELOG.md`, `PLAN.md` §16, `docs/REPO-MAP.md`,
  `work-packages/README.md`)
- Interfaces added: `npm run release:push`
- Verified: the limit is documented by GitHub ("Events will not be created for tags when
  more than three tags are pushed at once"); the gap was read from the Actions API — the
  commits `655efe7` (`v0.0.93`), `7e64dd1` (`v0.0.94`) and `bc75cb2` (`v0.0.95`) have no
  check run and no status; the script was run against a test repository with a bare
  remote and a `post-receive` hook: five pushes (one branch, four tags), a second run
  without a missing tag and a tag of an orphan branch is skipped
- Follow-up WP: WP-M1-20 (the rules in `AGENTS.md` and `PLAN.md` §18.3)
- Open question: none
