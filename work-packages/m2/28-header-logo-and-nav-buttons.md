# WP-M2-28: logo and top-level buttons in the shell header

format: small-model
status: implemented
depends-on: WP-M1-17, WP-M2-25
phase: 2
context-budget: 14k tokens
spec: PLAN.md §14 (header, touch targets ≥ 44 px, all text through i18n)
spec-lines: 20

files-read:

- apps/web/src/components/Shell.tsx — the phone-first shell header (WP-M1-17, WP-M2-25)
- apps/web/src/components/__tests__/shell.test.tsx — the existing shell fixtures
- apps/web/e2e/auth.spec.ts — the labels the Playwright smoke test asserts
- apps/web/src/i18n/locales/de/common.json — the `common` namespace
- docs/material/README.md — the supplied originals

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json

interfaces:

- `Shell` renders the product logo before the title and a `<nav>` with the links
  `/` and `/tickets` in the sticky header, outside the settings menu.
- New i18n keys `common:app.logoAlt`, `common:app.navigation` and
  `common:app.nav.{dashboard,tickets}` (de reference, en complete).

## Task

1. Asset: the supplied logo `docs/material/logo.png` (471×442 PNG, opaque dark badge
   with a light mark) is copied into `apps/web/public/logo.png`, downscaled to 128 px
   width so the header does not ship a 130 kB file. `docs/material/` keeps the
   original as the source of record; no code file is generated.
2. `Shell.tsx`: render the logo as `<img src="/logo.png">` (32 px high, rounded, alt
   text `t('app.logoAlt')`) before the product title. The dark badge of the logo
   blends into the `slate-900` header, so no background chip is needed.
3. `Shell.tsx`: below the title row render a `<nav aria-label={t('app.navigation')}>`
   with the two top-level buttons `dashboard` (`/`) and `tickets` (`/tickets`):
   44 px hit areas (`min-h-11`), the existing active styling, `aria-current="page"`
   on the active one, `/` matched exactly and `/tickets` matched by path prefix. The
   header stays `print:hidden`, so the sticker sheets of WP-M2-03 are unchanged.
4. Add the four keys to `common` in `de` and `en`; the de labels are the requested
   "Dashboard" and "Tickets".
5. `shell.test.tsx`: the two header links are reachable without opening the gear and
   the active one carries `aria-current="page"`.

## Non-goals

- No company name and no editable branding — the settings storage arrives with
  WP-M2-29, the input field and the header text with WP-M2-30.
- No favicon, manifest icon or PWA icon change.
- No change to the report form, the status page or the printed sticker (the 112
  notice of `PLAN.md` §2 is untouched).
- No permission filtering of the header links.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the Playwright auth spec keeps passing because the labels it
asserts (`auth.links.users`, `app.settings`, `app-version`) are unchanged.

## Handoff

- Files changed: `Shell.tsx`, the two `common.json`, the shell test, the new
  `apps/web/public/logo.png` asset, `docs/REPO-MAP.md`, `work-packages/README.md`
- Interfaces added: header `<nav>` with `/` and `/tickets`, logo image,
  `app.logoAlt`, `app.navigation`, `app.nav.*` keys
- Verified: `npm run check` green
- Follow-up WP: WP-M2-29 (branding settings API, `29-branding-settings-api.md`) and
  WP-M2-30 (branding input field and header text, `30-branding-settings-ui.md`) —
  both files are created in this commit
- Open question: none
