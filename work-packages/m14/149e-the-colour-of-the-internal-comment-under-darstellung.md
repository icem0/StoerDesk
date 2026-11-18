# WP-M14-149e: the colour of the internal comment under „Darstellung“

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 12k tokens
spec: docs/DECISIONS/0034-the-internal-comment-never-leaves-the-office.md; PLAN.md §14
spec-lines: 20

depends-on: WP-M14-149d

files-read:

- apps/web/src/settings/branding-page.tsx (the page of the Darstellung)
- apps/web/src/i18n/locales/de/common.json (the texts of the page)
- apps/web/src/settings/__tests__/branding-page.test.tsx (the test of the page)

files-write:

- apps/web/src/settings/branding-page.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/settings/__tests__/branding-page.test.tsx

interfaces:

- the field `internalCommentColor` of the form of the Darstellung
- the texts `branding.field.internalCommentColor`, `branding.hintInternalCommentColor` (de/en)

## Task

1. `apps/web/src/settings/branding-page.tsx`: the form of the Darstellung gains
   the field of the colour of the internal comment — a text field with the hex
   value and a swatch that shows it. The value of the page is the stored one;
   an empty field keeps the default of the server.
2. The same file: the body of the save carries the colour next to the company
   name, the title switch and the logo — one save, one request.
3. The texts `branding.field.internalCommentColor` and
   `branding.hintInternalCommentColor` in `common` (de and en): the label of
   the field and the hint that names the dark red as the default.
4. The web test: the field shows the stored colour, the swatch carries it, the
   save sends the value and an invalid hex value never leaves the browser.

## Non-goals

- No new page and no new entry of the settings menu: the colour belongs to the
  page of the Darstellung.
- No colour picker of the browser: a hex field with a swatch is enough and
  works on every browser of the office.
- No change of the ticket view: the view reads the colour in WP-M14-149g.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the page of the Darstellung, the two locale files, the test,
  the security plan, this document, the backlog, the changelog, `PLAN.md` §16
- Interfaces added: the field of the colour and the texts
  `branding.field.internalCommentColor`, `branding.hintInternalCommentColor`
- Verified: `npm run check`
- Follow-up WP: WP-M14-149f (the offline queue carries the internal comment)
- Open question: none
