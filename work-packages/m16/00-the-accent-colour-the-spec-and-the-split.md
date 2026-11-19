# WP-M16-00: the accent colour — the spec, ADR-0036 and the split

format: small-model
status: done
depends-on: WP-M15-06
phase: 16
milestone: m16
context-budget: 16k tokens
spec: PLAN.md §14, §16 phase 16, §17; specs/13-ui.md §14.1 … §14.6
spec-lines: 110

files-read:

- PLAN.md (§14 user interface, §16 phase roadmap, §17 work-package limits)
- specs/13-ui.md (the placeholder of chapter 14)
- apps/web/src/components/Shell.tsx (the header, the menu, the bell, the theme)
- apps/web/src/styles.css (the Tailwind entry, the light-theme palette)
- apps/api/src/settings/branding.ts (the branding row, the display route)
- packages/shared/src/schemas/settings.ts (the branding contracts)

files-write:

- specs/13-ui.md (§14.1 … §14.6, the placeholder marker removed)
- docs/DECISIONS/0036-the-interface-has-one-server-wide-accent-colour.md and
  docs/DECISIONS.md (the index)
- PLAN.md (§14, §16 phase-16 row and the record)
- work-packages/m16/ (WP-M16-01 … WP-M16-05, each file created in this commit),
  work-packages/README.md and CHANGELOG.md

interfaces:

- `accentColor` — the accent colour of the instance, a hex value of the `branding`
  settings row (ADR-0036)
- `--brand-accent` — the property the shell root writes, and the ramp
  `--color-accent-300 … --color-accent-700` that `styles.css` derives
- `specs/13-ui.md` §14.4 (the accent colour), §14.5 (the inbox inside the menu),
  §14.6 (the shell on a phone)

## Task

**The comment of the office.** „gib der ganzen ui ein facelift … mach die
akzentfarbe im menü unter darstellung serverweit einstellbar, verbessere die
Ansicht auf dem mobilgerät und rücke die Benachrichtigungs glocke den button
zum menü dazu neben den button für bereitschaft.“

This package is the **spec and the split** — it writes no product code:

1. Fill `specs/13-ui.md` from `PLAN.md` §14, review it and add the three new
   sections: §14.4 names the accent colour of the instance, its default `#0ea5e9`
   and the way it travels; §14.5 states that the inbox is an entry of the header
   menu right after the readiness entry; §14.6 states the shell on a phone.
2. Write `docs/DECISIONS/0036-the-interface-has-one-server-wide-accent-colour.md`
   (ADR-0036: one accent per instance, not per user, not at build time) and add
   its row to the index of `docs/DECISIONS.md`.
3. `PLAN.md` §14 gains the accent colour and the inbox entry of the menu,
   §16 gains the phase-16 row and the record of the split.
4. Create the work packages WP-M16-01 … WP-M16-05 in `work-packages/m16/` in
   numeric order: contracts and API → the field under „Darstellung“ → the accent
   ramp of the shell → the bell inside the menu → the mobile shell.
5. Record the phase in `work-packages/README.md` (the phase table and the
   backlog rows) and in `CHANGELOG.md`.

## Non-goals

- No schema, route, page, stylesheet or test code in this package.
- No migration: the colour is a value of the existing `branding` settings row.
- No change of the public report form, of the public status page or of the
  printed stickers — those surfaces keep the default blue (ADR-0036).
- No accent colour per user and no new permission key.

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: `wp:check` green with the six new WP files valid; `check` green,
because this package changes documentation only. No Docker gate is part of this
WP.

## Handoff

- Files changed: `specs/13-ui.md`, ADR-0036 and its index row, `PLAN.md` §14 and
  §16, the m16 WP files, `work-packages/README.md`, `CHANGELOG.md`
- Interfaces added: the contracts above — the accent value, the CSS property and
  the three sections of the UI slice
- Verified: `npm run wp:check` and `npm run check`
- Follow-up WP: WP-M16-01, WP-M16-02, WP-M16-03, WP-M16-04, WP-M16-05 (each file
  exists in this commit)
- Open question: none
