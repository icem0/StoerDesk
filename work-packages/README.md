# Work Packages

A work package (WP) is the smallest complete implementation unit.
One WP = one model run = one commit. The binding plan is [`PLAN.md`](../PLAN.md);
the size limits are in `PLAN.md` §17 and `AGENTS.md`.

Naming: `work-packages/<phase-or-milestone>/<nr>-<slug>.md`
Dependencies: header `depends-on: WP-XX-YY, ...`

## Phases and milestones

| Directory | Content                                                                       | WPs |
| --------- | ----------------------------------------------------------------------------- | --- |
| [m0](m0/) | Phase 0: startability, plan anchor, Docker smoke test                         | 4   |
| [m1](m1/) | Phase 1: foundation (monorepo, Compose, DB, i18n, RBAC, auth, admin UI, CI)   | 12  |
| [m2](m2/) | Phase 2: report online (objects, QR, report form, status page, spam, offline) | 10  |

`m0` uses the small-model format (`format: small-model`). The `m1` and `m2`
documents are legacy plans: they stay valid as scope descriptions, but each one
is rewritten into the small-model format before implementation.

## Status

> **Current state:** **Phase 0 is complete** — **WP-M0-01**, **WP-M0-02**,
> **WP-M0-03** and **WP-M0-04** are implemented (local startability, resilient
> start order, binding plan anchor, repeatable Docker smoke test
> `scripts/docker-smoke.sh` with the guarded CI job `docker-smoke`). The smoke run
> itself is proven by CI, because the development container has no Docker.
> In Phase 1 **WP-M1-01**, **WP-M1-02**, **WP-M1-03** and **WP-M1-04** are
> implemented (foundation, Compose, Drizzle base tables, i18n skeleton). The next
> package is **WP-M1-05** (RBAC tables + seeds); it is still a legacy document and
> is rewritten into the small-model format first, and `specs/01-rbac.md` is still a
> placeholder. The remaining WPs are working plans and are implemented only after
> approval — WP by WP, never in bulk. A WP counts as done only when code, tests,
> lint, typecheck and docs agree and the corresponding commit is pushed.

## Validation

```bash
npm run wp:check
```

The check enforces the small-model limits for WPs with `format: small-model`:
max. 120 lines, max. 4 written source files, max. 6 read source files, context
budget max. 30k tokens, required metadata and sections. Legacy WPs are reported
and skipped until they are migrated.
