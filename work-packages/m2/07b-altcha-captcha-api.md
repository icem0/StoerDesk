# WP-M2-07b: Altcha captcha API primitives

format: small-model
status: implemented
depends-on: WP-M2-07
phase: 2
context-budget: 18k tokens
spec: specs/06-report-form.md §7.6 (Altcha only when suspicious), PLAN.md §10 (spam protection bullet), §15 (captcha before heavy work)
spec-lines: 20

files-read:

- apps/api/src/tickets/spam.ts (WP-M2-07 — `isReportSuspicious`, when a challenge is needed)
- apps/api/src/tickets/report.ts (route plugin shape, `{ code, params }` envelope)
- apps/api/src/config/env.ts (env defaults pattern)
- apps/api/src/index.ts (how route plugins are registered)
- node_modules/altcha-lib/dist/index.d.ts + dist/types.d.ts (the v1 API actually shipped)

files-write:

- apps/api/src/tickets/altcha.ts
- apps/api/src/config/env.ts
- apps/api/src/index.ts
- apps/api/package.json (dependency `altcha-lib`, pinned to the v1 major)

interfaces:

- `POST /api/v1/public/altcha/challenge` — unauthenticated; `200` with
  `{ algorithm: 'SHA-256', challenge, salt, signature, maxnumber }`
- `createAltchaChallenge(secret, maxNumber, ttlMs?)` — `altcha-lib` `createChallenge`
  with `algorithm: 'SHA-256'` and `expires`, so a solved payload cannot be replayed
  forever; `ALTCHA_CHALLENGE_TTL_MS = 10 * 60 * 1000` (the length of the suspicion window)
- `verifyAltchaPayload(payload, secret): boolean` where the server-local
  `AltchaPayload = { algorithm, challenge, salt, signature, number, maxnumber?, took? }`
  — `altcha-lib.verifySolution` re-checks `hash(salt + number) === challenge`, the HMAC
  signature of that hash and the expiry; the shared request field arrives in WP-M2-07c
- env `ALTCHA_SECRET` (HMAC key, default `''` → challenge route answers
  `404 altcha_not_configured`) and `ALTCHA_MAX_NUMBER` (difficulty, default `10000`)

## Task

§7.6 requires a proof-of-work captcha **only** when a report is suspicious
(WP-M2-07). This package builds the two server primitives — issue a challenge and
verify a solved payload — but does **not** wire them into the create path
(that is WP-M2-07c) and does not build a widget (that is WP-M2-07d).

1. `apps/api/package.json`: `altcha-lib` **pinned to the v1 major** (`^1.4.1`): its
   challenge format `{ algorithm, challenge, salt, signature, maxnumber }` is what the
   `altcha` web component answers with and what the WP contract describes; the v2 major
   of the library uses a different challenge/payload shape. `.env.example`
   (bookkeeping): `ALTCHA_SECRET=`, `ALTCHA_MAX_NUMBER=10000`.
2. `apps/api/src/config/env.ts`: add the two env keys with the defaults above;
   an empty `ALTCHA_SECRET` means the captcha is not configured.
3. `apps/api/src/tickets/altcha.ts`: `createAltchaChallenge` and
   `verifyAltchaPayload` over `altcha-lib`, plus a `publicAltchaRoutes` plugin with
   `POST /api/v1/public/altcha/challenge`; with `ALTCHA_SECRET` empty the route answers
   `404 altcha_not_configured`. Same error envelope as the report route.
4. `apps/api/src/index.ts`: register `publicAltchaRoutes` next to the other public
    routes, passing `ALTCHA_SECRET` and `ALTCHA_MAX_NUMBER`.
5. Test (fixture outside the file budget)
   `apps/api/src/tickets/__tests__/altcha.spec.ts` (see Acceptance).

## Non-goals

- No change to `POST /api/v1/public/tickets` and no `suspected_spam` write —
  **WP-M2-07c** consumes `verifyAltchaPayload`.
- No frontend widget or challenge fetch — **WP-M2-07d**.
- No API-key / "invisible Altcha" mode; a single SHA-256 proof of work only.
- No `scripts/create-env.mjs` change: a generated `.env` keeps `ALTCHA_SECRET` empty,
  so the captcha is opt-in per installation (an unset secret never loses a report).

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npx vitest run src/tickets/__tests__/altcha.spec.ts
npm run wp:check
```

Expected: all green. The unit test creates a challenge, solves the proof of work
with `altcha-lib`, and asserts `verifyAltchaPayload` is `true` for the solved
payload and `false` for a tampered signature, a tampered challenge, a tampered
counter, the wrong secret and an expired challenge; the challenge route is `200`
with a secret and `404 altcha_not_configured` without.

## Handoff

- Files changed: `apps/api/src/tickets/altcha.ts` (new), `apps/api/src/config/env.ts`,
  `apps/api/src/index.ts`, `apps/api/package.json` + `package-lock.json`,
  `.env.example` (bookkeeping), the fixture `apps/api/src/tickets/__tests__/altcha.spec.ts`
  and the module row in `docs/REPO-MAP.md`
- Interfaces added: `publicAltchaRoutes`, `createAltchaChallenge`,
  `verifyAltchaPayload`, `AltchaChallenge`, `AltchaPayload`,
  `ALTCHA_CHALLENGE_TTL_MS`, env `ALTCHA_SECRET` / `ALTCHA_MAX_NUMBER`
- Verified: `npm run check` green — typecheck (3 workspaces), `eslint .` (0 errors, the
  one pre-existing `photo-upload.tsx` fast-refresh warning), `vitest run` 39 files /
  220 tests — the 5 new altcha tests ran, the integration specs ran against the reachable
  PostgreSQL of `TEST_DATABASE_URL` (not skipped) —, `i18n:check` (164 keys in `de`, 164 in
  `en`), `wp:check` (51 small-model WP, 0 failed); `npm run test:e2e` green with
  `E2E_CHROMIUM_PATH=/usr/bin/chromium` (4 Playwright tests); `npm run build -w
  @stoerdesk/api` and `-w @stoerdesk/web` green. The Docker smoke test does not run here
  (no Docker daemon); the CI `check`/publish runs of this tag are read after the push
  (`AGENTS.md` _CI after push_)
- Follow-up WP: consumed by `07c-spam-decision-report-path.md` (created with the
  WP-M2-07 rewrite); this package announces no new follow-up
- Open question: none
