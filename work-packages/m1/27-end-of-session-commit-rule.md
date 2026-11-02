# WP-M1-27: the end-of-session commit rule (retroactive record)

format: small-model
status: done (retroactive record — implemented in commit 7e64dd1, 2026-11-02,
without a WP)
depends-on: WP-M1-10e
phase: 1
context-budget: 10k tokens
spec: PLAN.md §18 (definition of done: the commit is part of the WP), §18.3 (one tag
per commit); `AGENTS.md` _Commits_
spec-lines: 20

files-read:

- AGENTS.md
- work-packages/README.md

files-write:

- AGENTS.md

interfaces:

- `AGENTS.md` section **_Session end (hard rule)_**: every session ends with a
  Conventional Commit carrying the DCO sign-off; an agent that stops with session
  changes uncommitted has not finished the task; `git status --short` is checked before
  the final answer and unrelated changes are never mixed into the session commit.

## Task

This document does **not** describe new work. It records the governance change of
commit `7e64dd1` (`docs(repo): require an end-of-session commit`), which changed only
`AGENTS.md` and therefore had no work package.

1. Repeated sessions ended with uncommitted work, so a WP's "one WP = one commit" rule
   broke and files sat in the working tree across runs.
2. `AGENTS.md` gained the hard rule: stage and commit every session change before the
   final answer, run `git status --short` first, keep unrelated changes out of the
   session commit (ask instead), and report the commit hash and the version tag printed
   by the hook.
3. The rule explicitly overrides the general "only commit when asked" default for this
   repository; only an explicit instruction to leave changes uncommitted waives it.

## Non-goals

- No hook change — the version tag of a commit stays `.husky/post-commit` work.
- No push rule — pushing stays the explicit `npm run release:push` (WP-M1-19, WP-M1-20).

## Acceptance

Documentation only; the gate of the record commit is:

```bash
npm run wp:check
```

Expected: green; the new document is inside the small-model limits.

## Handoff

- Files changed: `AGENTS.md`
- Interfaces added: the _Session end (hard rule)_ section
- Verified: the section exists in `AGENTS.md`; `npm run wp:check` green for this record
- Deviation: the commit landed before this record existed and named no WP
- Follow-up WP: none
- Open question: none
