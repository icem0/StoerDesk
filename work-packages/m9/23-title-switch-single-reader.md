# WP-M9-23: one reading point for the branding title switch

format: small-model
status: done
depends-on: WP-M9-22
phase: 9
milestone: m9
context-budget: 18k tokens
spec: PLAN.md §14 (branding settings); specs/02-data-model.md §4.x `tickets.title`
spec-lines: 30

files-read:

- apps/api/src/settings/branding.ts
- apps/api/src/objects/qr.ts
- apps/api/src/tickets/report.ts
- apps/api/src/tickets/internal.ts
- apps/api/src/db/schema.ts (`settings` row and `tickets.title`)
- work-packages/m2/95-internal-create-title-switch.md

files-write:

- apps/api/src/settings/branding-state.ts — the single reader of `titleEnabled`
- apps/api/src/settings/branding.ts — read the flag through the shared module
- apps/api/src/objects/qr.ts — read the flag through the shared module
- apps/api/src/tickets/report.ts — read the flag through the shared module

interfaces:

- `readTitleEnabled(database): Promise<boolean>` — the `titleEnabled` flag of the
  branding row; `false` for a missing or malformed row
- `parseTitleEnabled(value: unknown): boolean` — the same rule for an already
  fetched row value
- `BRANDING_KEY = 'branding'` — the key of the branding row in `settings`

## Task

The `titleEnabled` flag of the branding row was read four times with four copies
of the same defensive rule (`branding.ts`, `qr.ts`, `report.ts`, `internal.ts`).
The copies drifted apart in wording and would drift apart in behaviour.

1. Add `apps/api/src/settings/branding-state.ts` with `readTitleEnabled(database)`
   (the row read), `parseTitleEnabled(value)` (the value rule) and the exported
   `BRANDING_KEY` constant.
2. `apps/api/src/settings/branding.ts`: use `parseTitleEnabled` for the stored
   value and the shared `BRANDING_KEY` for the row key.
3. `apps/api/src/objects/qr.ts`: replace the local `titleEnabledOf` with
   `readTitleEnabled`.
4. `apps/api/src/tickets/report.ts` and `apps/api/src/tickets/internal.ts`:
   replace the inline row read with `readTitleEnabled`.

## Non-goals

- No behaviour change: the flag still defaults to `false` for a missing or
  malformed row, and the create paths still drop the title while it is off.
- No new route, no new schema, no migration, no i18n change.
- No ticket view change — the display gate is WP-M9-25.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green. The four existing title-switch integration tests (branding,
QR resolve, public report, internal create) still prove the same rule.

## Handoff

- Files changed: `apps/api/src/settings/branding-state.ts` (new),
  `apps/api/src/settings/branding.ts`, `apps/api/src/objects/qr.ts`,
  `apps/api/src/tickets/report.ts`, `apps/api/src/tickets/internal.ts`
- Interfaces added: `readTitleEnabled`, `parseTitleEnabled`, `BRANDING_KEY`
- Verified: typecheck, lint, targeted `test:run`, `wp:check`
- Follow-up WP: WP-M9-24 (the ticket view honours the switch), WP-M9-25 (the
  internal form offers the title only while the switch is on)
- Open question: none
