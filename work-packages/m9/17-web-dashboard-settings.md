# WP-M9-17: dashboard settings page

format: small-model
status: done
depends-on: WP-M9-08, WP-M9-16
phase: 9
milestone: m9
context-budget: 14k tokens
spec: specs/11-dashboard.md §11.8; specs/12-stats.md §12.6
spec-lines: 45

files-read:

- specs/11-dashboard.md (§11.8 administration)
- specs/12-stats.md (§12.6 settings)
- apps/web/src/settings/branding-page.tsx (admin form pattern)
- apps/web/src/routes/index.tsx (admin route registration)
- apps/web/src/components/Shell.tsx (administration menu)
- apps/web/src/i18n/locales/de/settings.json (settings namespace)

files-write:

- apps/web/src/admin/dashboard-settings-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/components/Shell.tsx
- apps/web/src/i18n/locales/{de,en}/settings.json

interfaces:

- `DashboardSettingsPage` at `/admin/dashboard`, guarded by `settings.read`
- TV token display with copy and rotate actions
- anonymisation switch and conspicuous threshold (1–100)
- link to the wall display URL

## Task

1. Build `dashboard-settings-page.tsx` on `GET/PUT
   /api/v1/settings/dashboard`: show the TV token with a copy action and a
   rotate button that sends `{ rotateTvToken: true }` after an inline
   confirmation.
2. Add the anonymisation switch and the conspicuous threshold field; validate
   1–100 before the request and show field/API errors inline.
3. Build and show the absolute wall-display URL `/tv/<token>` with a copy action;
   never log the token.
4. Register `/admin/dashboard`, add the menu entry under administration, and add
   the labels to the `de`/`en` `settings` namespace.
5. Keep the page inside the existing admin form style: back link, save button,
   saved notice and error codes.

## Non-goals

- No TV page change (WP-M9-16).
- No per-display token list and no display heartbeat.
- No statistics filter on this page; the threshold is the only statistics key.
- No new permission key.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run build
npm run wp:check
```

Expected: all green; the page loads the settings, rotates the token and saves
the threshold; a user without `settings.write` sees the values read-only.

## Handoff

- Files changed: the dashboard settings page, the route table, the shell menu,
  both settings locale files
- Interfaces added: `/admin/dashboard`
- Verified: typecheck, lint, test:run, i18n:check, build, wp:check
- Follow-up WP: WP-M9-18 (phase-9 exit criterion and record)
- Open question: none
