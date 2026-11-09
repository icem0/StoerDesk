# WP-M9-32: branding logo magic-byte check (SEC-019)

format: small-model
status: done
depends-on: WP-M9-31
phase: 9
milestone: m9
context-budget: 10k tokens
spec: PLAN.md §15 (audit — SEC-019); specs/07-admin.md §8.x (branding)
spec-lines: 18

files-read:

- apps/api/src/settings/branding.ts (validateLogo)
- apps/api/src/tickets/photos.ts (detectImageType, IMAGE_SIGNATURES)
- packages/shared/src/schemas/settings.ts (logo field schema)

files-write:

- apps/api/src/settings/branding.ts

interfaces:

- `validateLogo` runs the magic-byte check of `detectImageType` on the decoded payload
  and answers `400 invalid_request` when the bytes do not match the claimed MIME type.

## Task

1. `apps/api/src/settings/branding.ts`: import `detectImageType` from
   `apps/api/src/tickets/photos.ts`; after the size check in `validateLogo`,
   decode the base64 payload, run `detectImageType`, require the detected MIME
   to equal the claimed prefix (`image/jpeg` / `image/png`), otherwise
   `{ code: 'invalid_request', params: { fields: ['logo'] } }`.

## Non-goals

- No schema change, no UI change, no migration.
- `detectImageType` is reused as the single image signature table (§4.10 photos and
  admin logo share one magic-byte rule).

## Acceptance

```bash
npm run check
```

## Handoff

- Files changed: `apps/api/src/settings/branding.ts`
- Interfaces added: none (reuse `detectImageType`)
- Verified: `npm run check`
- Follow-up WP: WP-M9-33 (iCal feed expiry + log redaction, SEC-005 / SEC-011)
- Open question: none
