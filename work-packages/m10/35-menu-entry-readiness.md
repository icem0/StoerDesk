# WP-M10-35: "Bereitschaft" becomes a menu entry of its own

format: small-model
status: planned
depends-on: WP-M10-34
phase: 10
milestone: m10
context-budget: 14k tokens
spec: PLAN.md §14; specs/13-ui.md
spec-lines: 40

files-read:

- apps/web/src/components/Shell.tsx (the navigation of the header)
- apps/web/src/components/__tests__/shell.test.tsx (the shell test)
- apps/web/src/i18n/locales/de/common.json (the navigation labels)
- specs/13-ui.md (the navigation)

files-write:

- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/de/common.json
- apps/web/src/i18n/locales/en/common.json
- apps/web/src/components/__tests__/shell.test.tsx

interfaces:

- `app.nav.oncall` — the label of the new menu entry in `de` and `en`
- the header navigation — `Dashboard`, `Tickets`, `Bereitschaft`

## Task

1. The header navigation of the shell gets the third entry "Bereitschaft"
   ("On call"); it leads to `/oncall`, the page with the readiness calendar.
   The entry is matched by prefix, so `/oncall` and its children stay active.
2. The label comes from the new key `app.nav.oncall` in `de` and `en`.
3. The shell test asserts the three entries and the target of the new one.

## Non-goals

- No change of the settings menu and no change of the pages behind it.
- No change of the routes.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; the navigation shows "Dashboard", "Tickets" and
"Bereitschaft".

## Handoff

- Files changed: the shell, both common locale files, the shell test
- Interfaces added: `app.nav.oncall`
- Verified: typecheck, lint, test:run, i18n:check, wp:check
- Follow-up WP: none
- Open question: none
