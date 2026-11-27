# WP-M31-02: the specification of the customer portal

format: ctx-256k
status: done
depends-on: WP-M31-01
phase: 31
milestone: m31
context-budget: 50k tokens
spec: specs/19-customer-portal.md §19.1–§19.12; PLAN.md §16 (phase 31)
spec-lines: 274
changed-lines: 340

files-read:

- specs/19-customer-portal.md (the slice of this work package)
- specs/01-rbac.md §3.1–§3.9 (the roles, the sessions, the one-time password)
- specs/06-report-form.md §7 (the report form of the QR code)
- specs/07-escalation.md §7.5, §7.14 (the actions of a rule)
- specs/10-notifications.md §11.1–§11.5a (the channels, the mailbox of the instance)
- docs/DECISIONS/0053-the-customer-is-a-user-with-the-role-customer.md (ADR-0053)
- docs/DECISIONS/0054-the-registration-confirms-itself-over-a-link.md (ADR-0054)
- docs/DECISIONS/0055-the-ticket-carries-the-customer.md (ADR-0055)
- docs/DECISIONS/0056-the-report-of-the-reporter-leaves-the-installation-as-an-escalation-action.md (ADR-0056)
- PLAN.md §16 (the phases), §3.1 (the namespaces)
- apps/api/src/tickets/report.ts (the public report)
- apps/api/src/objects/qr.ts (the token of the object)

files-write:

- specs/19-customer-portal.md
- specs/01-rbac.md
- specs/README.md
- work-packages/README.md

interfaces:

- `specs/19-customer-portal.md` — the slice with the model, the data, the routes and the pages of the phase
- the phase row of the phase 31 in the table of `work-packages/README.md`

## Task

1. Write the slice **`specs/19-customer-portal.md`** with the content of the
   four decisions:
   - §19.1 the customer is a user with the role `customer` and his two
     permissions,
   - §19.2 the trained people of an object (`object_assignments`, the
     permission `object.assign`),
   - §19.3 the registration — the availability of the e-mail channel, the
     request, the confirmation over the link, the activation, the limits,
   - §19.4 the forgotten password — the same mechanism with the purpose
     `password_reset`,
   - §19.5 the portal of the customer — the own open tickets, the own
     objects, the visible history and the `404` for a ticket of somebody
     else,
   - §19.6 the report by QR code — the three checkboxes: the confirmation of
     the trained person is **always mandatory**, the registration makes the
     address mandatory, the opt-in is greyed out while the address is empty;
     the transaction of the report with the registration,
   - §19.7 the customer on the ticket,
   - §19.8 the action `notify_reporter`,
   - §19.9 the data model, §19.10 the routes, §19.11 the pages, §19.12 the
     rules of the security.
2. Amend the chapter of the RBAC `specs/01-rbac.md` §3.1/§3.3/§3.4: the
   system role `customer` with the permissions `ticket.customer.read` and
   `object.customer.read`, the permission `object.assign` of the
   administration and the new key `ticket.customer.read` in the matrix.
3. Register the slice in the index of the slices `specs/README.md`.
4. Announce the phase in `work-packages/README.md`: the row of the phase in
   the table of the phases and the rows of the packages in the backlog.

## Non-goals

- No code, no migration, no route — the specification decides, the code
  follows.
- No change of the chapters that the slice touches — the slice names what it
  amends.
- No customer data in the repository.

## Acceptance

```bash
npm run lint
npm run wp:check
```

Expected: all green; the slice, the four decisions and the plan name the same
model.

## Handoff

- Files changed: the slice of the customer portal, the index of the slices,
  the backlog of the work packages
- Interfaces added: `specs/19-customer-portal.md`
- Verified: the commands above
- Follow-up WP: WP-M31-03 — the role `customer` and the contracts of the
  portal; WP-M31-04 — the data model of the phase
- Open question: none
