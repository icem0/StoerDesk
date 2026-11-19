# WP-M16-02: the accent colour sits under „Darstellung“

format: small-model
status: planned
depends-on: WP-M16-01
phase: 16
milestone: m16
context-budget: 18k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14
spec-lines: 60

files-read:

- apps/web/src/settings/branding-page.tsx (the form, the colour field and the swatch)
- apps/web/src/settings/__tests__/branding-page.test.tsx (the pattern of the page test)
- apps/web/src/i18n/locales/de/common.json (`branding.*` keys)
- apps/web/src/i18n/locales/en/common.json
- specs/13-ui.md (§14.4)

files-write:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/branding-page.test.tsx

interfaces:

- a text field `accentColor` on the form of the Darstellung and a swatch
  `data-testid="branding-accent-swatch"`
- `branding.field.accentColor`, `branding.hintAccentColor` in `de` and `en`
- the body of `PUT /api/v1/settings/branding` carries `accentColor`

## Task

1. `apps/web/src/settings/branding-page.tsx` gains the field „Akzentcolor“ below
   the colour of the internal comment: a text input prefilled with the stored
   colour of the branding response (the default `#0ea5e9` while nothing is
   configured) and a second swatch that shows the colour, beside the swatch of
   the internal comment colour.
2. The save sends the accent colour with the company name, the title switch, the
   logo and the internal comment colour, so one save writes the whole row. A
   value that is no hex colour is caught in the browser: the page names the
   mistake with `branding.errors.colorInvalid` and sends nothing.
3. The texts come from the `common` namespace in `de` and `en`: the label of the
   field and the hint that names the parts of the interface the colour paints.
4. The page test gains the accent field: the prefilled stored value, the typed
   value inside the body of the save, the colour of the accent swatch and the
   malformed value that sends no request.

## Non-goals

- No change of the shell, of the stylesheet or of the accent classes — WP-M16-03
  paints them.
- No accent colour on the personal settings page: the colour belongs to the
  instance (ADR-0036).
- No new error key: the malformed colour reuses `branding.errors.colorInvalid`.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run i18n:check
npm run test:run
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed:
- Interfaces added:
- Verified:
- Follow-up WP: WP-M16-03, WP-M16-04, WP-M16-05 (each file exists in the commit
  of the split)
- Open question: none
