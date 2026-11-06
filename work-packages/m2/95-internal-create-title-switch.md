# WP-M2-95: internal ticket creation honours the branding title switch

format: small-model
status: implemented
depends-on: WP-M2-89
phase: 2
context-budget: 20k
spec: PLAN.md §7 rule 1 (internal ticket creation), WP-M2-89 (branding `titleEnabled`), PLAN.md §6 (`tickets.title`)
spec-lines: 30

files-read:

- apps/api/src/tickets/internal.ts — `createInternalTicket`, WP-M2-15
- apps/api/src/tickets/report.ts — `createPublicReport` branding read pattern, WP-M2-89
- apps/api/src/objects/qr.ts — `titleEnabledOf`, WP-M2-90
- apps/api/src/db/schema.ts — `settings` row and `tickets.title`, WP-M2-04
- apps/api/src/tickets/__tests__/deadline.integration.spec.ts — test setup pattern
- work-packages/m2/89-public-report-optional-title.md

files-write:

- work-packages/m2/95-internal-create-title-switch.md — this work package
- apps/api/src/tickets/internal.ts — store `title` only when `titleEnabled` is true
- apps/api/src/tickets/__tests__/internal-title.integration.spec.ts — title stored vs dropped

interfaces:

- `POST /api/v1/tickets` inserts `tickets.title = NULL` when the `branding` settings row has `titleEnabled` false or is missing/malformed; otherwise stores `input.title ?? null` as before. The `created` event payload is unchanged.
- Default stays `false` when nothing is configured.

## Task

1. `apps/api/src/tickets/internal.ts`: inside `createInternalTicket`, after resolving the object, read the `branding` settings row exactly like `qr.ts:120` (`titleEnabledOf`) / `report.ts:219`; insert `title: titleEnabled ? (input.title ?? null) : null` instead of the unconditional `input.title ?? null`.

2. `apps/api/src/tickets/__tests__/internal-title.integration.spec.ts`: open test database, create one object and one actor, then assert: `branding` row missing → posted title stored as `NULL`; `titleEnabled: false` → `NULL`; `titleEnabled: true` → title stored; repeated writes keep the decision.

## Non-goals

- No UI change (title field stays visible in `/tickets/create`, server-side enforcement only), no new permission key, no settings migration, no i18n change.
- Ticket detail rendering keeps showing stored titles; the switch affects creation only.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: all green; the new test really runs (a reachable database is required — if it skips, report it as unverified).

## Handoff

- Files changed: `apps/api/src/tickets/internal.ts`, the new integration test, this WP doc, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: none beyond honoring the existing `titleEnabled` flag internally
- Verified: `npm run wp:check`, `npm run check` all green
- Follow-up WP: none
- Open question: none
