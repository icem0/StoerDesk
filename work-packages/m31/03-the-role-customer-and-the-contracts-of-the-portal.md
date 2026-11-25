# WP-M31-03: the role `customer` and the contracts of the portal

format: ctx-256k
status: planned
depends-on: WP-M31-02
phase: 31
milestone: m31
context-budget: 45k tokens
spec: specs/19-customer-portal.md §19.1, §19.3, §19.5, §19.6, §19.7; specs/01-rbac.md §3.1, §3.3, §3.4
spec-lines: 120
changed-lines: 300

files-read:

- specs/19-customer-portal.md §19.1 (the role `customer`), §19.3 (the registration), §19.5 (the portal), §19.6 (the report form), §19.7 (the customer on the ticket)
- specs/01-rbac.md §3.1 (the roles), §3.3 (the matrix), §3.4 (the catalog)
- packages/shared/src/permissions.ts (the catalog, the system roles, the matrix)
- packages/shared/src/schemas/ticket.ts (the report form and the internal creation)
- packages/shared/src/schemas/index.ts (the index of the schemas)
- packages/shared/src/schemas/auth.ts (the rules of the password)
- packages/shared/src/**tests**/permissions.test.ts (the matrix of the roles)
- apps/api/src/db/seed-rbac.ts (the seed of the roles)

files-write:

- packages/shared/src/permissions.ts
- packages/shared/src/schemas/customer.ts
- packages/shared/src/schemas/index.ts
- packages/shared/src/schemas/ticket.ts
- packages/shared/src/**tests**/permissions.test.ts
- packages/shared/src/**tests**/customer.test.ts
- apps/api/src/tickets/**tests**/deadline.integration.spec.ts

interfaces:

- `PERMISSIONS.ticket.customerRead` — the own tickets of the customer (`ticket.customer.read`)
- `PERMISSIONS.object.customerRead` — the own objects of the customer (`object.customer.read`)
- `PERMISSIONS.object.assign` — the assignment of a trained person to an object (`object.assign`)
- `SYSTEM_ROLE_KEYS` — the sixth system role `customer`
- `DEFAULT_ROLES.customer` — the two permissions of the customer
- `publicReportRequestSchema` — the fields `trainedPersonConfirmed`, `emailNotifications` and `register`
- `internalCreateTicketRequestSchema` — the field `customerUserId`
- `customerRegisterRequestSchema`, `customerPasswordResetRequestSchema`, `customerSetPasswordRequestSchema`, `customerTokenSchema`, `objectAssignmentSchema`, `customerTicketSummarySchema`, `customerTicketDetailSchema`, `customerObjectSchema`

## Task

1. **The catalog** `packages/shared/src/permissions.ts`: the three new keys
   `ticket.customer.read`, `object.customer.read` and `object.assign`, the
   sixth system role `customer` and its matrix — the own tickets and the own
   objects, nothing else.
2. **The contracts of the portal**
   `packages/shared/src/schemas/customer.ts`: the availability of the
   registration, the request of the registration, the request of a new
   password, the token of a link (43 base64url characters), the answer of a
   token, the new password, the assignment of an object and the answers of
   the portal (the ticket, its detail, the object).
3. **The report form** `packages/shared/src/schemas/ticket.ts`: the field
   `trainedPersonConfirmed`, the field `emailNotifications` and the field
   `register` in the public report; the field `customerUserId` in the internal
   creation.
4. **The index** `packages/shared/src/schemas/index.ts` carries the new file.
5. **The tests**: the matrix of the roles knows the customer and its two
   permissions, the contracts of the portal are proved by their own test, and
   the test of the deadline builds the report with the new fields.

## Non-goals

- No route and no table — the contracts and the role come first.
- No change of the five roles of the office.
- No customer data in the fixtures.

## Acceptance

```bash
npm run typecheck --workspaces --if-present
npm run lint
npm run test:run
npm run wp:check
```

Expected: all green; the new test fails before the change and passes after it.

## Handoff

- Files changed: the catalog of the permissions, the contracts of the portal,
  the contracts of the report and of the internal creation, the tests
- Interfaces added: the role `customer`, the three permissions and the
  contracts of the portal
- Verified: the commands above
- Follow-up WP: WP-M31-04 — the data model of the phase
- Open question: none
