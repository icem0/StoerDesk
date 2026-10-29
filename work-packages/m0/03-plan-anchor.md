# WP-M0-03: Anchor the binding build plan

format: small-model
depends-on: —
phase: 0
context-budget: 18k tokens
spec: PLAN.md §0, §17
spec-lines: 60

files-read:

- AGENTS.md
- README.md
- specs/README.md
- CHANGELOG.md
- work-packages/README.md

files-write:

- PLAN.md
- AGENTS.md
- specs/README.md
- CHANGELOG.md

interfaces:

- `PLAN.md` (binding entry point)
- `docs/WP-TEMPLATE.md`
- `npm run wp:check`

## Task

1. Write `PLAN.md` with scope, stack decisions, phases, WP limits, acceptance
   summary and open decisions.
2. Add a build-plan anchor at the top of `AGENTS.md` and point the reading order
   to `PLAN.md`.
3. Update `specs/README.md`: `PLAN.md` is authoritative while a slice is a
   placeholder; no implementation from placeholders.
4. Update `CHANGELOG.md` and the README status to name the plan, the phases and
   the M0 work packages.

## Non-goals

- No domain implementation.
- No rewrite of the existing M1/M2 work packages.
- No change to the database schema.
- No translation of the legacy WP documents.

## Acceptance

```bash
grep -n "PLAN.md" AGENTS.md README.md specs/README.md CHANGELOG.md
grep -R "110" README.md AGENTS.md specs/06-report-form.md
npm run wp:check
```

Expected: `PLAN.md` is referenced by every entry point; the second command has
no output (no other emergency number); `wp:check` reports the new WPs.

## Handoff

- Files changed: `PLAN.md`, `AGENTS.md`, `specs/README.md`, `CHANGELOG.md`
- Interfaces added: `npm run wp:check`
- Follow-up WP: WP-M0-04
- Open question: none
