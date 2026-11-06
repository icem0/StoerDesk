# AGENTS

How work happens in this repository — for every coding agent and developer working
on **StörDesk**.

This file contains **no project facts**. What is built, which stack is used, which
conventions and quality gates apply and where the project stands is decided in
`PLAN.md` and the slices in `specs/`; the inventory of the code is `docs/REPO-MAP.md`.
If you are about to write a scope, a data model, a command list, a module
description or a status report here, it belongs in `PLAN.md` or `docs/REPO-MAP.md`.

## Build plan anchor

**`PLAN.md` is the binding entry point.** Read it before any work package. It holds
the scope, the stack decisions, the project conventions (§3, §4, §4.1, §6), the
phases, the work-package limits (§17), the quality gates and developer commands (§18)
and the open decisions. A spec slice wins over `PLAN.md` only after it was reviewed
and contains real content.

If `PLAN.md` and an older work package disagree, stop and update the plan or the
work package first. Never implement a feature that has no work package. Further
domain logic (tickets, objects, on-call, notifications, UI) is created only as the
implementation of a work package from `work-packages/` — package by package, never
in bulk.

## Before you start a work package

1. Read `PLAN.md`, `specs/README.md` plus the spec section the WP names, the WP file
   itself, `docs/REPO-MAP.md` and `docs/DECISIONS.md`.
2. Collect the announced follow-ups of the running phase with
   `git grep -n "Follow-up WP:\|Open question:" -- work-packages/<phase>/` and
   report them, so nothing announced stays unnoticed.
3. Check the WP against the limits of `PLAN.md` §17 and split it **before** writing
   code if it does not fit.
4. Open a todo list (see _Todo list (mandatory)_).

## Work package discipline

- One WP = one commit = one model run.
- Respect the file, line and context limits and the required WP metadata of
  `PLAN.md` §17; validate with `npm run wp:check`.
- Stay inside the WP's `files-write`. Repository bookkeeping outside it
  (`CHANGELOG.md`, `docs/REPO-MAP.md`, `PLAN.md` §16, `work-packages/README.md`) is
  part of the same commit; it is never a reason to widen a WP.
- Layer order and the "do not mix layers" rule: `PLAN.md` §17.

## Open follow-ups (mandatory closure)

- **A split creates files, not sentences.** When a WP is split, the child WP
  documents (`work-packages/<phase>/<nr><suffix>-<slug>.md`) are created **in the
  same commit** as the parent rewrite. A `Follow-up WP:` line without a WP file is a
  defect, not a backlog entry.
- **Collect before starting.** Run the `git grep` of _Before you start a work
  package_ and report the open items.
- **Numeric order, same phase.** The open items of the running phase are implemented
  in numeric order (…b, …c, …d, …e, then the plain numbers) **before** the next
  phase starts. A phase is closed only when every follow-up of that phase is
  implemented or explicitly cancelled with a reason in the parent WP's `## Handoff`.
- **One backlog of record.** The `Open follow-ups` table of
  `work-packages/README.md` is the backlog; the status prose there and the status
  section of `PLAN.md` §16 are history. Update the table in the commit that adds,
  starts or finishes an item.

## Code conventions

Do not invent them, and do not restate them here: they are `PLAN.md` §3 (language,
user-facing text, error contract) with §3.1 (i18n mechanics), §4 and §4.1 (stack and
coding conventions) and §6 (data model, IDs, timestamps), plus the module contracts
in `docs/REPO-MAP.md`. Read the surrounding code first and match its style, naming
and existing helpers. If a rule is missing or unclear, write an ADR or ask — never
invent a convention silently.

## Quality gate

Run after every change:

```bash
npm run check
```

and `npm run build` when the change ships an artifact. What the gates run, which
Docker checks a Docker-related WP adds and which development commands exist is
`PLAN.md` §18. Rules for you:

- A failed gate is read in its log, fixed and committed again. A WP never ends with
  a red gate.
- Never silence, skip, weaken or rewrite a test or a lint rule to make a gate green.
- A gate that skipped because a prerequisite is missing (database, browser, Docker)
  is reported as unverified, never presented as green (`PLAN.md` §18).

## Commits

- **Conventional Commits** are mandatory: `feat(web): ...`, `fix(api): ...`,
  `docs(spec): ...`, `chore(repo): ...` — subjects and bodies in English.
- Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- **DCO**: every commit message ends with `Signed-off-by: <name> <email>`
  (`git commit -s`).
- **One work package = one commit.** The subject names the work package
  (e.g. `feat(web): WP-M1-09 admin ui users and roles`).
- **Push after every work package.** Run `git push --follow-tags` immediately
  after the commit; never collect several work packages into one push. GitHub
  creates no tag push event when more than three tags arrive at once, so a batch
  push leaves the older commits without a check run and without published images.
  `.husky/pre-push` refuses a push with more than three tags. `npm run release:push`
  stays the command that pushes the branch plus older missing tags, one tag per push.
- `commitlint` enforces the format and the sign-off (Husky hook `commit-msg`).
- Never commit secrets, tokens or PII.

### Session end (hard rule)

- **Every session ends with a commit.** Before the final answer, stage and commit
  every change made in the session with a Conventional Commit and the DCO sign-off.
  An agent that stops with session changes uncommitted has not finished the task.
- This end-of-session commit is the default in this repository and overrides the
  general "only commit when explicitly asked" default. Only an explicit instruction
  from the user to leave changes uncommitted waives it.
- Run `git status --short` before the final answer. If unrelated changes remain,
  do not silently mix them into the session commit: ask whether to include them or
  commit them separately with their own message. An explicit "commit everything"
  includes them.
- If the commit is blocked (failed hook, conflict, missing identity), fix it or
  report the blocker and the exact remaining files; never end silently.
- Report the commit hash and the version tag printed by the hook. Pushing remains a
  separate, explicit action (`npm run release:push`).

## Versioning (one tag per commit)

- Every commit gets the next patch version as an annotated git tag; the hook
  mechanism and the reason for it are `PLAN.md` §18.3. Never hand-create a tag,
  except to correct a commit whose hook did not run.
- After each commit read the line the hook prints
  (`commit <short-hash> successful - version v0.0.N …`) and report it, with the
  version, to the user. Never push a commit that did not print it.
- Push with `npm run release:push`; tags are never pushed automatically. The script
  pushes the branch and every missing version tag **one tag per push**: GitHub
  creates no tag push event when more than three tags are pushed at once, and the
  quality gates hang on that event, so a batch push would leave commits without a
  check run and without published images.

## CI after push

- Do not finish a work package with an unpushed commit.
- After the push wait for the `check` run titled `v0.0.NN` and for its follow-up
  publish run; how both are triggered and titled is `PLAN.md` §18.3.
- The publish run writes the version tags of its commit and promotes `latest` to the
  newest version that exists in the registry. `latest` never depends on which build
  finished last.
- A WP is complete only when those runs are green (or a job is skipped by design).
  If a job fails, read the failing log, fix it in a new commit and push again.
- Report to the user: the run titles, the version tag, the commit hash, the run URL
  and the final conclusion.
- A green local `npm run check` is **not** a substitute for the CI result: it does
  not run the Docker smoke test, and this development container has no Docker
  daemon.

## Todo list (mandatory)

From three sub-steps onwards keep a todo list via `todowrite`:

- create all steps as `pending` at the start,
- exactly one step `in_progress` at a time,
- `completed` only after real verification (lint/test/build actually ran),
- blocked steps stay `in_progress` and name the blocker,
- before the final answer no `pending`/`in_progress` left without an explicit mention.

## Structure discipline

- Directory structure, module overview and conventions live in `docs/REPO-MAP.md`
  (max. 200 lines) and are updated **after every work package**.
- New modules are added to the module table with purpose and public API.
- Do not create files outside the designated areas; `docs/material/` holds the
  supplied originals, `specs/` holds the expanded slices (mirrored from the
  supplied original or from `PLAN.md` when the original is missing).

## Data protection and security

- No secrets in the repository. `.env` is ignored, `.env.example` is the template.
- The GitHub push credential lives in the git credential store of the environment
  (`PLAN.md` §18.3). Never write a token into the repository, docs, logs or commits.
- No PII in logs, tests or fixtures; no plaintext contact data in the diff.
- Before changing the report form, its confirmation or a printed sticker, re-read the
  emergency rule of `PLAN.md` §2: the 112 notice stays visible, StörDesk is never an
  emergency call path, and no other emergency number enters product text.
