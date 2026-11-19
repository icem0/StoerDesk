# WP-M16-01: the accent colour reaches the API

format: small-model
status: done
depends-on: WP-M16-00
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14
spec-lines: 60

files-read:

- packages/shared/src/schemas/settings.ts (the branding contracts)
- apps/api/src/settings/branding.ts (the branding row, the display route)
- apps/api/src/settings/__tests__/branding.integration.spec.ts (the pattern)
- specs/13-ui.md (§14.4)

files-write:

- packages/shared/src/schemas/settings.ts
- apps/api/src/settings/branding.ts
- apps/api/src/settings/__tests__/branding.integration.spec.ts

interfaces:

- `brandingResponseSchema` / `updateBrandingRequestSchema` gain `accentColor`
- `displaySettingsResponseSchema` gains `accentColor`
- `DEFAULT_ACCENT_COLOR = '#0ea5e9'` and `storedAccentColor(value)`
- `GET /api/v1/settings/branding`, `GET /api/v1/settings/display`, `PUT
  /api/v1/settings/branding`

## Task

1. `packages/shared/src/schemas/settings.ts` exports `DEFAULT_ACCENT_COLOR`
   (`#0ea5e9`, the blue the interface painted before) and answers `accentColor`
   in `brandingResponseSchema` and in `displaySettingsResponseSchema`. The field
   is optional in `updateBrandingRequestSchema` and validated by the existing
   `hexColorSchema`.
2. `apps/api/src/settings/branding.ts` reads the value of the existing `branding`
   row through a `storedAccentColor` helper that answers the default for a row
   without a colour and for a row whose value is no hex colour. Both GET routes
   answer the colour.
3. The PUT keeps the stored colour while the body carries none — the rule the
   internal comment colour already follows — and writes the colour into the row
   beside the company name, the title switch, the logo and the internal comment
   colour. A hex value that is malformed is rejected by the schema with
   `400 invalid_request`.
4. The integration test gains the accent colour: the default before anything is
   configured, a saved value read back by `GET /api/v1/settings/display` for a
   colleague with `ticket.read`, the value kept when a later body carries none,
   and a malformed colour answered with `400`.

## Non-goals

- No UI and no i18n text in this package — WP-M16-02 puts the field on the page.
- No stylesheet change and no CSS custom property.
- No new route, no new table, no migration and no new permission key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `packages/shared/src/schemas/settings.ts`, `apps/api/src/settings/branding.ts`,
  `apps/api/src/settings/__tests__/branding.integration.spec.ts`
- Interfaces added: `accentColor` in `brandingResponseSchema`, `displaySettingsResponseSchema`
  and `updateBrandingRequestSchema`, `DEFAULT_ACCENT_COLOR`, `storedAccentColor(value)`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run wp:check`
  against a reachable Postgres
- Follow-up WP: WP-M16-02, WP-M16-03, WP-M16-04, WP-M16-05 (each file exists in the
  commit of the split)
- Open question: none

