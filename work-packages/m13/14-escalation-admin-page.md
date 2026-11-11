# WP-M13-14: The administration page of the escalation

format: small-model
status: planned
depends-on: WP-M13-05, WP-M13-12
phase: 13
milestone: m13
context-budget: 22k tokens
spec: specs/07-escalation.md §7.9; PLAN.md §14
spec-lines: 50

files-read:

- specs/07-escalation.md §7.9
- apps/web/src/admin/deadlines-page.tsx (the deadline form)
- apps/web/src/admin/admin-home-page.tsx (the module list)
- apps/web/src/routes/index.tsx (the route table)
- apps/web/src/settings/settings-page.tsx (the settings overview)

files-write:

- apps/web/src/admin/escalation-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/i18n/locales/de/settings.json, apps/web/src/i18n/locales/en/settings.json

interfaces:

- `EscalationPage` at `/admin/escalation` with the tabs "Fristen" and
  "Stufen & Regeln"
- `GET/PUT /api/v1/escalation/config`, `PUT /api/v1/escalation/stages`

## Task

1. Add the page with the two tabs: the tab "Fristen" carries the deadline hours
   per priority (the form of the former deadlines page), the tab "Stufen & Regeln"
   carries the stages of §7.1 with their names, their active flag and their rules
   (read-only in this package, the editor comes with WP-M13-15).
2. Register the route and the module in the administration home and in the
   settings overview.
3. The route `/admin/deadlines` answers a redirect to the tab "Fristen", so the
   old bookmarks keep working.
4. Add the German and English texts of the page and of the tabs.

## Non-goals

- No rule editor and no condition builder (WP-M13-15).
- No action editor (WP-M13-16).
- No change to the deadline form of the API.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
npm run wp:check
```

Expected: all green; the page reads the configuration and the stages, and stays
read-only without `settings.write`.

## Handoff

- Files changed: the page, the route table, the administration home, the two
  locale files
- Interfaces added: `EscalationPage`
- Verified: typecheck, the i18n check
- Follow-up WP: WP-M13-15 — the rule editor and the condition builder
- Open question: none
