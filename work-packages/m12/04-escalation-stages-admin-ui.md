# WP-M12-04: Admin UI for escalation stages

format: small-model
status: done
depends-on: WP-M12-03
phase: 12
context-budget: 22k tokens
spec: specs/07-escalation.md §7.5
spec-lines: 60

files-read:

- apps/web/src/admin/deadlines-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/i18n/locales/de/settings.json

files-write:

- apps/web/src/admin/escalation-stages-page.tsx
- apps/web/src/routes/index.tsx
- apps/web/src/admin/admin-home-page.tsx
- apps/web/src/i18n/locales/de/settings.json

interfaces:

- `EscalationStagesPage` at `/admin/escalation-stages`
- `GET/PUT /api/v1/settings/escalation-stages`

## Task

1. Add the guarded admin page: list the ordered stages, edit key, German and
   English name and deadline minutes, add and remove a stage.
2. Reorder by drag and drop (native HTML5 drag events) and persist the array order.
3. Register the route and an entry on the administration home.
4. Add the German and English texts (the English file mirrors every key).

## Non-goals

- No ticket-page changes (WP-M12-06).
- No extra locale beyond `de` and `en`; the stored `names` record stays extensible.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run i18n:check
npm run wp:check
```

Expected: all green; without `settings.write` the form is read-only.

## Handoff

- Files changed: page, route, admin home, de/en locale.
- Interfaces added: `EscalationStagesPage`.
- Verified: typecheck, i18n check.
- Follow-up WP: WP-M12-05 — manual escalation write API.
- Open question: none
