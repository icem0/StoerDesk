# WP-M2-07b: Altcha captcha API primitives

format: small-model
status: planned
depends-on: WP-M2-07
phase: 2
context-budget: 18k tokens
spec: specs/06-report-form.md §7.6 (Altcha only when suspicious), PLAN.md §10 (spam protection bullet), §15 (captcha before heavy work)
spec-lines: 20

files-read:

- apps/api/src/tickets/spam.ts (WP-M2-07 — `isReportSuspicious`, when a challenge is needed)
- apps/api/src/tickets/report.ts (route plugin shape, `{ code, params }` envelope)
- packages/shared/src/schemas/ticket.ts (`publicReportRequestSchema` — where the payload will ride)
- apps/api/src/config/env.ts (env defaults pattern)
- apps/api/src/index.ts (how route plugins are registered)

files-write:

- apps/api/src/tickets/altcha.ts
- apps/api/src/config/env.ts
- apps/api/src/index.ts
- apps/api/package.json (dependency `altcha-lib`)

interfaces:

- `POST /api/v1/public/altcha/challenge` — unauthenticated; `200` with
  `{ algorithm: 'SHA-256', challenge, salt, signature, maxnumber }`
- `createAltchaChallenge(secret, maxNumber)` → the object above (from `altcha-lib`)
- `verifyAltchaPayload(payload, secret): boolean` where
  `payload = { algorithm: 'SHA-256', challenge, salt, signature, maxnumber, key? }` —
  recomputes the HMAC signature of `challenge + salt` and verifies the proof of work
  through `altcha-lib`; the payload type is server-local here, the shared request field
  arrives in WP-M2-07c
- env `ALTCHA_SECRET` (HMAC key, default `''` → challenge route disabled) and
  `ALTCHA_MAX_NUMBER` (difficulty, default `10000`)

## Task

§7.6 requires a proof-of-work captcha **only** when a report is suspicious
(WP-M2-07). This package builds the two server primitives — issue a challenge and
verify a solved payload — but does **not** wire them into the create path
(that is WP-M2-07c) and does not build a widget (that is WP-M2-07d).

1. `apps/api/package.json`: add `altcha-lib`; `.env.example` (bookkeeping):
   `ALTCHA_SECRET=`, `ALTCHA_MAX_NUMBER=10000`.
2. `apps/api/src/config/env.ts`: add the two env keys with the defaults above;
   an empty `ALTCHA_SECRET` means the captcha is not configured.
3. `apps/api/src/tickets/altcha.ts`: `createAltchaChallenge` and
   `verifyAltchaPayload` over `altcha-lib` (the payload type is a server-local
   `AltchaPayload`; the shared request field is added in WP-M2-07c), plus a
   `publicAltchaRoutes` plugin with `POST /api/v1/public/altcha/challenge`; with
   `ALTCHA_SECRET` empty the route answers `404 altcha_not_configured`. Same error
   envelope as the report route.
4. `apps/api/src/index.ts`: register `publicAltchaRoutes` next to the other public
   routes, passing `ALTCHA_SECRET` and `ALTCHA_MAX_NUMBER`.
5. Test (fixture outside the file budget)
   `apps/api/src/tickets/__tests__/altcha.spec.ts` (see Acceptance).

## Non-goals

- No change to `POST /api/v1/public/tickets` and no `suspected_spam` write —
  **WP-M2-07c** consumes `verifyAltchaPayload`.
- No frontend widget or challenge fetch — **WP-M2-07d**.
- No API-key / "invisible Altcha" mode; a single SHA-256 proof of work only.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run src/tickets/__tests__/altcha.spec.ts
npm run wp:check
```

Expected: all green. The unit test creates a challenge, solves the proof of work
with `altcha-lib`, and asserts `verifyAltchaPayload` is `true` for the solved
payload and `false` for a tampered one and for the wrong secret; the challenge
route is `200` with a secret and `404 altcha_not_configured` without.

## Handoff

- Files changed: `apps/api/src/tickets/altcha.ts` (new), `apps/api/src/config/env.ts`,
  `apps/api/src/index.ts`, `apps/api/package.json`, `.env.example` (bookkeeping), the
  fixture `apps/api/src/tickets/__tests__/altcha.spec.ts` and the module row in
  `docs/REPO-MAP.md`
- Interfaces added: `publicAltchaRoutes`, `createAltchaChallenge`,
  `verifyAltchaPayload`, env `ALTCHA_SECRET` / `ALTCHA_MAX_NUMBER`
- Verified: (to be filled by the implementation run)
- Follow-up WP: consumed by `07c-spam-decision-report-path.md` (created with the
  WP-M2-07 rewrite); this package announces no new follow-up
- Open question: none
