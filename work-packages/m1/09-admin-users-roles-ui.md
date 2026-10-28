# WP-M1-09: Admin-UI Nutzer + Rollen

depends-on: WP-M1-08
milestone: m1

## Ziel

Seiten /admin/users und /admin/roles: Nutzer anlegen, Rolle zuweisen, Rolle anlegen/bearbeiten.
Nur mit `user.write` bzw. `settings.write` erreichbar.

## Spec-Referenzen

- specs/01-rbac.md §3.3, §3.7 (Frontend usePermission)
- specs/13-ui.md

## Aufgabe

1. `apps/web/src/lib/usePermission.ts`
2. `apps/web/src/features/admin/users/` (Liste, Detail, Anlegen)
3. `apps/web/src/features/admin/roles/` (Liste, Detail, Permissions-Checkboxen)
4. i18n-Keys de+en
5. API-Routes GET/POST/PATCH /api/v1/users, /api/v1/roles (Service + Zod + Test)
6. Tests: 403 ohne Permission, 200 mit, UI zeigt Rollen-Checkboxen

## Akzeptanz

- Admin kann Nutzer anlegen und Rolle zuweisen
- Nicht-Admin sieht die Seiten nicht (usePermission)
- API liefert 403 bei direktem Aufruf ohne Permission
