# WP-M2-20: navigation for tickets and objects

format: small-model
status: implemented
depends-on: WP-M2-16, WP-M2-17b
phase: 2
context-budget: 18k tokens
spec: PLAN.md §14 (internal UI: dashboard, ticket list, object list, settings)
spec-lines: 30

files-read:

- apps/web/src/components/Shell.tsx — the settings menu with the nav items
- apps/web/src/routes/index.tsx — the route table
- apps/web/src/i18n/locales/de/common.json — nav labels

files-write:

- apps/web/src/components/Shell.tsx — add ticket, ticket-create and object nav items
- apps/web/src/i18n/locales/de/common.json — nav labels
- apps/web/src/i18n/locales/en/common.json — nav labels

interfaces:

- The settings menu (gear next to the version) lists, in this order:
  Meldungen (`/tickets`), Neue Störung melden (`/tickets/create`), Objekte
  (`/objects`), QR-Aufkleber (`/objects/stickers`), Benutzerverwaltung
  (`/admin/users`), Rollenverwaltung (`/admin/roles`).
- New i18n keys `common:auth.links.tickets`, `common:auth.links.ticketCreate`,
  `common:auth.links.objects`.

## Task

1. `apps/web/src/components/Shell.tsx`: extend `navItems` with the ticket list, the
   internal ticket creation and the object list. The label lookup currently uses a
   nested ternary — replace it with a key lookup so the list stays readable.
2. `apps/web/src/i18n/locales/{de,en}/common.json`: add `auth.links.tickets`,
   `auth.links.ticketCreate` and `auth.links.objects`.

## Non-goals

- Dashboard tiles (separate WP)
- Permission-based hiding of the nav items (the server guard stays the
  enforcement point; hiding is cosmetic)
- Breadcrumbs or an active-route highlight beyond the exact path

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
npm run i18n:check
```

Expected: all green.

## Handoff

- Files changed: the three files above
- Interfaces added: nav items for tickets, ticket creation and objects
- Follow-up WP: WP-M2-21 (dashboard start page)
