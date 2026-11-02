# WP-M2-07d: Honeypot field and Altcha widget in the report form

format: small-model
status: planned
depends-on: WP-M2-07c
phase: 2
context-budget: 22k tokens
spec: specs/06-report-form.md §7.1–§7.3 (form, `422`/`400` handling), §7.6 (spam), PLAN.md §3.1 (i18n), §10 (mobile-first, Altcha only when suspicious), §14 (44 px, screen usable on a phone)
spec-lines: 25

files-read:

- apps/web/src/features/tickets/report-form-page.tsx (controlled form, `handledErrorCodes`, submit)
- apps/web/src/features/tickets/photo-upload.tsx (controlled child-component pattern)
- apps/web/src/lib/api.ts (`apiFetch`, `ApiError.code`)
- apps/web/src/i18n/locales/de/ticket.json and en/ticket.json (`report.*` keys)

files-write:

- apps/web/src/features/tickets/report-form-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json
- apps/web/package.json (dependency `altcha` web component)

interfaces:

- the report body always carries `website` (honeypot): a real input `name="website"`
  that is visually hidden, `autoComplete="off"`, `tabIndex={-1}`, `aria-hidden` and
  has **no** visible label (so no translated string and no tab stop)
- `AltchaCaptcha({ challenge, onVerified })` — a component **inside**
  `report-form-page.tsx` that renders the `altcha` custom element with the challenge
  from WP-M2-07b; `onVerified(payload)` hands the solved `verification` back
- `useAltchaChallenge()` — `GET /v1/public/altcha/challenge` through `apiFetch`,
  called **only** after a `400 captcha_required`
- `handledErrorCodes` gains `captcha_required`; the submit flow: submit →
  on `captcha_required` fetch a challenge, show the widget above the send button,
  re-submit once with `verification` set → confirmation as before
- i18n keys `report.spam.captcha` and `report.errors.captcha_required` in `de` and `en`

## Task

WP-M2-07c flags honeypot reports and answers `400 captcha_required` for a
suspicious report without a proof of work. This package makes the public form send
the honeypot and, only when the server asks, solve and resend with the Altcha
payload — the reporter never sees a captcha for a normal report.

1. `report-form-page.tsx`: add the hidden `website` field bound to a `website`
   state that stays empty for a human; include it in the `POST /v1/public/tickets`
   body.
2. Add `captcha_required` to `handledErrorCodes`; on that error set `captchaNeeded`
   and fetch a challenge via `useAltchaChallenge()` (only then, §7.6 "only when
   suspicious").
3. Inside `report-form-page.tsx`: an `AltchaCaptcha` component that wraps the `altcha`
   custom element, feeds it the challenge and emits `onVerified(payload)`;
   `apps/web/package.json`: add `altcha` and register the element once (module side
   effect in the page file).
4. On the next submit send the solved `verification`; a `201`/`200` shows the
   existing confirmation unchanged. The widget sits above the send button, 44 px
   tall, with the translated `report.spam.captcha` label.
5. `de`/`en` `ticket.json`: `report.spam.captcha` and `report.errors.captcha_required`.

## Non-goals

- No server or schema change — done in WP-M2-07/07b/07c.
- No E2E for the captcha path — the phase 2 exit-criterion E2E is **WP-M2-10**.
- No honeypot styling beyond visually hidden; never a visible "leave empty" text.
- No captcha shown before the server signals suspicion.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npx vitest run src/features/tickets/__tests__/report-form-page.test.tsx
npm run wp:check
```

Expected: all green; the existing form test still passes and `i18n:check` finds the
two new keys in both locales and referenced in the code.

## Handoff

- Files changed: `apps/web/src/features/tickets/report-form-page.tsx` (honeypot field
  and the in-file `AltchaCaptcha`),
  `apps/web/src/i18n/locales/de/ticket.json`,
  `apps/web/src/i18n/locales/en/ticket.json`, `apps/web/package.json` and the
  bookkeeping
- Interfaces added: honeypot `website` field, `AltchaCaptcha`, `useAltchaChallenge`,
  i18n `report.spam.captcha` / `report.errors.captcha_required`
- Verified: (to be filled by the implementation run)
- Follow-up WP: none — the captcha path is exercised by the existing **WP-M2-10**
  (phase 2 exit criterion)
- Open question: none
