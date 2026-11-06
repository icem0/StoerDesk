# WP-M4-10: Top-right options dropdown on the ticket detail

format: small-model
status: done
depends-on: WP-M4-08, WP-M4-09b
phase: 4
context-budget: 18k tokens
spec: PLAN.md §7, §14
spec-lines: 30

files-read:

- apps/web/src/features/tickets/ticket-detail-page.tsx
- apps/web/src/i18n/locales/de/ticket.json
- apps/web/src/i18n/locales/en/ticket.json

files-write:

- apps/web/src/features/tickets/ticket-detail-page.tsx — replaced the bottom inline action `<select>` with a top-right options button (`⋮`) opening a dropdown holding: PDF export, E-Mail export, stornieren / stornierung aufheben, endgültig löschen (permission-gated), workflow actions and "Zurück zur Liste"; click-away/Escape close the dropdown
- apps/web/src/i18n/locales/de/ticket.json — `detail.menu.pdf`, `detail.menu.email`, `detail.menu.back`, `detail.options.title`
- apps/web/src/i18n/locales/en/ticket.json — same keys in English

interfaces:

- no API change; `GET/POST/DELETE` guards unchanged; PDF and E-Mail export navigate to `/tickets/:ticketNo/pdf` and `/tickets/:ticketNo/email` (views added in WP-M4-11/WP-M4-12)

## Task

1. Removed the bottom inline `<select>` action menu and its label.
2. Added a top-right options button next to the status/priority badges; clicking opens a dropdown (closes on click-away/Escape).
3. Dropdown entries: "PDF exportieren", "E-Mail exportieren", divider, "Stornieren"/"Stornierung aufheben" (status-dependent), "Endgültig löschen" (only `CANCELLED` + `ticket.delete`), divider, workflow actions, divider, "Zurück zur Liste".
4. Choosing stornieren/löschen/workflow shows the existing inline confirmation panel; PDF/E-Mail navigate to the new views.
5. i18n keys `detail.menu.pdf`, `detail.menu.email`, `detail.menu.back`, `detail.options.title` in `de` and `en`.

## Non-goals

- No PDF/E-Mail generation yet (WP-M4-11/WP-M4-12).
- No API, schema, migration or permission change.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
npm run build
```

Expected: all green; the detail page shows a top-right options button opening a dropdown with PDF/E-Mail/storno/delete; no bottom inline action select remains.

## Handoff

- Files changed: `apps/web/src/features/tickets/ticket-detail-page.tsx`, `apps/web/src/i18n/locales/de/ticket.json`, `apps/web/src/i18n/locales/en/ticket.json`
- Interfaces added: none (UI rework only)
- Verified: typecheck, eslint, vitest (545 tests), i18n:check (655/655), wp:check (234/234)
- Follow-up WP: branded PDF view (WP-M4-11), branded e-mail view (WP-M4-12)
- Open question: none
