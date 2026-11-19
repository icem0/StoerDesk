# WP-M16-06: the colour picker sits under „Darstellung“

format: small-model
status: done
depends-on: WP-M16-02
phase: 16
milestone: m16
context-budget: 16k tokens
spec: specs/13-ui.md §14.4; PLAN.md §14
spec-lines: 60

files-read:

- apps/web/src/settings/branding-page.tsx (the form, both colour fields and the swatches)
- apps/web/src/settings/__tests__/branding-page.test.tsx (the pattern of the page test)
- apps/web/src/i18n/locales/de/common.json (`branding.*` keys)
- apps/web/src/i18n/locales/en/common.json
- specs/13-ui.md (§14.4)

files-write:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/i18n/locales/de/common.json, apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/branding-page.test.tsx, specs/13-ui.md,
  CHANGELOG.md, work-packages/README.md, this document

interfaces:

- a colour picker per colour under „Darstellung“: `internalCommentColorPicker`
  and `accentColorPicker` as `input type="color"`
- the keys `branding.picker.internalCommentColor`,
  `branding.picker.accentColor` and `branding.hintPicker` in `de` and `en`
- the body of `PUT /api/v1/settings/branding` carries the colour that was picked

## Task

**The comment of the office (out of band in phase 16).** „unter darstellung bei
der auswahl der farben ein colourpicker einbauen“ — the two colour fields of the
Darstellung answer a hex value the admin has to know; a picker chooses the tone
visually.

1. `apps/web/src/settings/branding-page.tsx` gains a **picker per colour**: one
   `input type="color"` next to the hex field of the internal comment colour and
   one next to the accent colour. Each picker is prefilled with the stored colour
   of the branding response (the default while nothing is configured) and is a
   44 px tap target (`h-11 w-11`); the browser renders it as its own colour
   picker.
2. The picker and the hex field of one colour share one state: the picker writes
   its value into the same state as the text field, so whichever was changed
   last is the colour that is saved. `onSubmit` sends that state beside the
   company name, the title switch, the logo and the other colour, so one save
   still writes the whole row.
3. Validation stays: a value that is no hex colour never leaves the browser —
   the page names the mistake with `branding.errors.colorInvalid` and sends
   nothing. The picker of a browser only answers `#rrggbb`, so it never breaks
   that rule.
4. Texts come from the `common` namespace in `de` and `en`: `branding.picker.
   internalCommentColor`, `branding.picker.accentColor` and the shared hint
   `branding.hintPicker` that names the picker beside the exact hex field.
5. The page test gains the pickers: the prefilled stored colour in the picker, a
   picked accent colour inside the body of the save, a picked internal comment
   colour inside the body of the save, both colours picked in one save and the
   pickers disabled without `settings.write`.
6. `specs/13-ui.md` §14.4 gains the picker as a bullet, `work-packages/README
   .md` gains the row, `CHANGELOG.md` gains the entry.

## Non-goals

- No API, schema, migration or permission change: the picked colour is a hex
  value of the existing `branding` row (ADR-0036).
- No new request and no colour library: the browser picker of `input
  type="color"` is the picker.
- No picker for the logo and no theme colour: the theme stays `auto`/`light`/`
  dark` (WP-M2-92).
- No change of the shell, the stylesheet or the accent classes — WP-M16-03
  paints them.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new assertions fail before the change and pass after it.

## Handoff

- Files changed: `apps/web/src/settings/branding-page.tsx`, the two `common.json`
  locale files, `apps/web/src/settings/__tests__/branding-page.test.tsx`,
  `specs/13-ui.md` §14.4, `CHANGELOG.md`, `work-packages/README.md`
- Interfaces added: the pickers `internalCommentColorPicker` and
  `accentColorPicker` on the Darstellung, the keys `branding.picker.internal
  CommentColor`, `branding.picker.accentColor` and `branding.hintPicker` in
  `de` and `en`
- Verified: `npm run typecheck`, `npm run lint`, `npm run test:run`,
  `npm run i18n:check`, `npm run wp:check`
- Follow-up WP: none
- Open question: none
