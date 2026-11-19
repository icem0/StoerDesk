# WP-M14-180: the records name the released versions and the module map the editor

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 10k tokens
spec: specs/07-escalation.md §7.13; PLAN.md §16
spec-lines: 20

depends-on: WP-M14-179

files-read:

- CHANGELOG.md (the labels of the work packages)
- docs/SECURITY-PLAN.md (the pass note and the audit SHAs)
- docs/REPO-MAP.md (the tree of the admin screens)
- work-packages/README.md (the backlog of record)
- work-packages/m14/175-the-transitions-of-the-workflow-in-the-escalation.md
  (the editor of the steps)

files-write:

- CHANGELOG.md, docs/SECURITY-PLAN.md
- docs/REPO-MAP.md, work-packages/README.md
- work-packages/m14/180-the-records-name-the-released-versions.md

interfaces:

- `CHANGELOG.md` — the version labels of WP-M14-175 and WP-M14-176 name the
  versions of their commits
- `docs/SECURITY-PLAN.md` — the pass note and the checked-at SHAs name the
  current commits
- `docs/REPO-MAP.md` — the admin screen tree names `EscalationTransitions`
  instead of `TransitionPage`

## Task

1. `CHANGELOG.md`: the version labels of WP-M14-175 and WP-M14-176 are corrected
   to v1.1.297 and v1.1.301 — the labels of the other entries already match.
2. `docs/SECURITY-PLAN.md`: the pass note and the checked-at SHAs of the areas
   A, B, C, D, H and K name the current SHA of the last work package.
3. `docs/REPO-MAP.md`: the admin screen tree replaces `TransitionPage` by
   `EscalationTransitions` (WP-M14-175/177); `work-packages/README.md` gains the
   row of this package.

## Non-goals

- No change of the code, the API or the tests.

## Acceptance

```bash
npm run lint
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: `CHANGELOG.md`, `docs/SECURITY-PLAN.md`, `docs/REPO-MAP.md`,
  `work-packages/README.md`, this document
- Interfaces added: none — the records name what is there
- Verified: `npm run lint` (0 errors), `npm run wp:check` green
- Follow-up WP: none — the comment of the office is closed
- Open question: none
