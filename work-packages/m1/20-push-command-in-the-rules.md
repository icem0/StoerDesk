# WP-M1-20: the governance documents name the new push command

format: small-model
status: done
depends-on: WP-M1-19
phase: 1
context-budget: 10k tokens
spec: PLAN.md §18.3
spec-lines: 20

files-read:

- AGENTS.md
- PLAN.md
- CONTRIBUTING.md
- docs/REPO-MAP.md

files-write:

- AGENTS.md
- PLAN.md
- CONTRIBUTING.md

interfaces:

- `npm run release:push` — the documented way to publish a commit and its version tag

## Task

WP-M1-19 replaced `git push --follow-tags` with `npm run release:push`, because GitHub
creates no tag push event when more than three tags are pushed at once and the quality
gates hang on that event. The governance documents still named the old command, so an
agent or a contributor would have used the command that loses a check run.

1. `AGENTS.md`: the versioning section and the session-end rule name
   `npm run release:push` and state why one tag per push is necessary.
2. `PLAN.md` §18.3: the version-tag rules name the new command and carry the rule
   "one tag per push" with the GitHub limitation behind it.
3. `CONTRIBUTING.md`: the commit rules and the section "Before pushing" use the new
   command.

## Non-goals

- No change to a workflow file, a script or a hook.
- No change to the historical entries of `CHANGELOG.md` and to the work-package
  documents of earlier packages.

## Acceptance

```bash
npm run check
npm run wp:check
```

Expected: green, and `git push --follow-tags` appears in no current rule of
`AGENTS.md`, `PLAN.md` or `CONTRIBUTING.md`.

## Handoff

- Files changed: `AGENTS.md`, `PLAN.md`, `CONTRIBUTING.md` and the bookkeeping outside
  `files-write` (`docs/REPO-MAP.md`, `work-packages/README.md`, `PLAN.md` §16)
- Interfaces added: none
- Verified: `npm run check` green locally
- Follow-up WP: none
- Open question: none
