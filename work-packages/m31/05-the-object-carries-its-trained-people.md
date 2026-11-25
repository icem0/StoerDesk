# WP-M31-05: the object carries its trained people

format: ctx-256k
status: planned
depends-on: WP-M31-04
phase: 31
milestone: m31
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.2 (the trained people of an object), §19.7 (the customer on the ticket)
spec-lines: 30
changed-lines: 480

files-read:

- specs/19-customer-portal.md §19.2 (the assignments), §19.7 (the customer on the ticket)
- apps/api/src/objects/service.ts (the routes of the objects, the error contract)
- apps/api/src/objects/**tests**/objects.integration.spec.ts (the pattern of an object test)
- apps/api/src/auth/requirePermission.ts (the guard of a route)
- apps/api/src/db/schema.ts (the tables `object_assignments`, `users`, `user_roles`)
- apps/web/src/features/objects/object-edit-page.tsx (the page of the object)
- apps/web/src/lib/api.ts (the client of the API)
- apps/web/src/i18n/locales/de/object.json (the texts of the object)

files-write:

- apps/api/src/objects/assignments.ts
- apps/api/src/index.ts
- apps/api/src/objects/**tests**/assignments.integration.spec.ts
- apps/web/src/features/objects/object-assignments.tsx
- apps/web/src/features/objects/object-edit-page.tsx
- apps/web/src/i18n/locales/de/object.json
- apps/web/src/i18n/locales/en/object.json

interfaces:

- `GET /api/v1/objects/:objectNo/assignments` — the trained people of the object
- `POST /api/v1/objects/:objectNo/assignments` — the assignment of a customer
- `DELETE /api/v1/objects/:objectNo/assignments/:userId` — the removal of an assignment
- `listAssignments(database, objectNo)` — the trained people for the internal creation of a ticket
- `ObjectAssignments` — the section of the edit page of the object

## Task

1. **The routes** `apps/api/src/objects/assignments.ts`:
   - the list of the trained people (`object.read`),
   - the assignment of a customer (`object.assign`),
   - the removal of an assignment (`object.assign`).
     The write refuses a user that has not the role `customer`
     (`404 customer_not_found`) and the second assignment of the same customer
     (`409 object_assignee_exists`).
2. **The registration** of the routes in `apps/api/src/index.ts`.
3. **The test** proves that the administration assigns a customer and removes
   the assignment again, that the second assignment is refused, that a user
   without the role `customer` is refused and that the customer himself gets
   `403 forbidden` on the list.
4. **The section** `apps/web/src/features/objects/object-assignments.tsx` in the
   edit page of the object: the list of the trained people, the field that
   names a customer of the user list and the two buttons. The section reads
   the assignments of the object and the customers of the user list.
5. **The texts** in the locales `de` and `en` under `assignments`.

## Non-goals

- No registration of a customer — the customer comes with WP-M31-06.
- No selection of the customer in the internal creation of a ticket — that is
  WP-M31-09.
- No change of the fields of the object itself.

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

- Files changed: the routes of the assignments, the registration, the test, the
  section of the object and the texts
- Interfaces added: the three routes and the component
- Verified: the commands above
- Follow-up WP: WP-M31-06 — the registration of the customer
- Open question: none
