# WP-M31-16: the administration knows the customer

format: ctx-256k
status: done
depends-on: WP-M31-15
phase: 31
milestone: m31
context-budget: 35k tokens
spec: specs/19-customer-portal.md §19.1 (the role `customer`), §19.2 (the assignment)
spec-lines: 20
changed-lines: 140

files-read:

- specs/19-customer-portal.md §19.1 (the role of the customer), §19.2 (the assignment of the object)
- apps/web/src/admin/user-form-parts.tsx (the field of the roles)
- apps/web/src/admin/roles-page.tsx (the table of the roles)
- apps/web/src/i18n/locales/de/settings.json (the texts of the administration)
- packages/shared/src/permissions.ts (the system roles)

files-write:

- apps/web/src/admin/user-form-parts.tsx
- apps/web/src/i18n/locales/de/settings.json
- apps/web/src/i18n/locales/en/settings.json

interfaces:

- `admin.roles.keys.<roleKey>` — the readable name of a role
- `admin.users.fields.customerHint` — the hint of the role `customer`

## Task

1. **The name of the roles**: the field of the roles in the user administration
   showed the machine key — the office saw `reporter_internal` and `customer`
   instead of a readable name. Every system role carries a name now; a custom
   role keeps its key.
2. **The hint of the customer**: the field of the roles explains the role
   `customer` — the customer reports in the customer portal and sees his open
   reports there, and the office assigns his installations in the edit page of
   the object.

## Non-goals

- No change of the role API and no change of the table of the roles.
- No new page of the administration.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run i18n:check
npm run wp:check
```

Expected: all green; `npm run i18n:check` knows the names of the roles in both
locales.

## Handoff

- Files changed: the field of the roles and the texts
- Interfaces added: the name of a role and the hint of the customer
- Verified: the commands above
- Follow-up WP: none — the phase is closed
- Open question: none
