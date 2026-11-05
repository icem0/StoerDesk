# WP-M2-90: public QR resolve carries the title switch

format: small-model
status: implemented
depends-on: WP-M2-89
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (settings: branding), PLAN.md §6 (tickets.title), PLAN.md §3 (i18n, errors)
spec-lines: 15

files-read:

- packages/shared/src/schemas/object.ts — `qrResolveResponseSchema`, `publicQrObjectSchema` (WP-M2-02)
- apps/api/src/objects/qr.ts — `resolveQrToken`, public `GET /api/v1/public/qr/:token` (WP-M2-02)
- apps/api/src/settings/branding.ts — the branding jsonb row `{ companyName, titleEnabled }` (WP-M2-29/89)
- packages/shared/src/schemas/settings.ts — `brandingResponseSchema` (WP-M2-89)
- apps/api/src/tickets/report.ts — the branding read of `createPublicReport` (WP-M2-89)

files-write:

- packages/shared/src/schemas/object.ts — `titleEnabled: z.boolean()` on `qrResolveResponseSchema`
- apps/api/src/objects/qr.ts — read the `branding` settings row, answer `titleEnabled` in both resolve paths

interfaces:

- `qrResolveResponseSchema` = `{ token, redirected, object, titleEnabled }`
- `GET /api/v1/public/qr/:token` answers `titleEnabled` (`false` when the row is missing or malformed)
- no auth, no new route: the public resolve response is the only carrier of the switch

## Task

1. `object.ts`: add `titleEnabled: z.boolean()` to `qrResolveResponseSchema`; the
   `QrResolveResponse` type follows via `z.infer`.
2. `qr.ts`: read the `branding` settings row (`settings.key = 'branding'`, `settings.value.titleEnabled`,
   default `false`) once per resolve and pass it in both `qrResolveResponseSchema.parse` calls
   (current token and retired redirect). Follow the jsonb read pattern of `report.ts` (WP-M2-89):
   `typeof value.titleEnabled === 'boolean' ? value.titleEnabled : false`.
3. Extend `apps/api/src/objects/__tests__/qr.integration.spec.ts`: insert the branding row
   `{ key: 'branding', value: { companyName: '', titleEnabled: true } }` and expect
   `titleEnabled: true` in a resolve body; without that row the resolve answers `false`.

## Non-goals

- No UI: the form field and the checkbox are WP-M2-90b.
- No new route, no table, no migration.
- `GET /api/v1/settings/branding` stays auth-guarded and untouched.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green.

## Handoff

- Files changed: the two source files above plus the extended QR test and the
  `QrResolveResponse` stub in `apps/web/src/features/tickets/__tests__/report-form-page.test.tsx`
- Interfaces added: `titleEnabled` on `qrResolveResponseSchema`, public QR resolve answers the switch
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run` (465 tests), `npm run i18n:check`,
  `npm run wp:check` all green.
- Follow-up WP: WP-M2-90b (report form title field, branding checkbox)
- Open question: none
