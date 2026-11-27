# WP-M31-01: the decisions of the customer portal

format: ctx-256k
status: done
depends-on: —
phase: 31
milestone: m31
context-budget: 45k tokens
spec: PLAN.md §16 (phase 31), §2 (the emergency notice), §3/§3.1 (the language and the namespaces)
spec-lines: 20
changed-lines: 320

files-read:

- PLAN.md §2 (the emergency notice), §3/§3.1 (the language and the namespaces), §16 (the phases)
- specs/01-rbac.md §3.1–§3.9 (the roles, the sessions, the one-time password)
- specs/06-report-form.md §7 (the report form of the QR code)
- specs/07-escalation.md §7.5 (the actions of a rule)
- specs/10-notifications.md §11.1–§11.5a (the channels, the mailbox of the instance)
- docs/DECISIONS/0046-the-mailbox-of-the-instance.md (ADR-0046)
- apps/api/src/db/schema.ts (the tables `users`, `objects`, `tickets`)
- apps/api/src/notifications/config.ts (the configuration of the e-mail channel)
- apps/api/src/objects/qr.ts (the token of the object)
- apps/api/src/tickets/report.ts (the public report)
- apps/web/src/routes/index.tsx (the public routes outside the shell)
- apps/web/src/features/tickets/report-form-page.tsx (the form of the report)

files-write:

- docs/DECISIONS/0053-the-customer-is-a-user-with-the-role-customer.md
- docs/DECISIONS/0054-the-registration-confirms-itself-over-a-link.md
- docs/DECISIONS/0055-the-ticket-carries-the-customer.md
- docs/DECISIONS/0056-the-report-of-the-reporter-leaves-the-installation-as-an-escalation-action.md
- docs/DECISIONS.md
- PLAN.md

interfaces:

- ADR-0053 — the customer is a user with the role `customer`; the trained person is an assignment of the object
- ADR-0054 — the registration confirms itself over a link and exists only with a configured e-mail channel
- ADR-0055 — the ticket carries the customer; the trained person of the object is selectable
- ADR-0056 — the report of the reporter leaves the installation as the escalation action `notify_reporter`

## Task

1. Write **ADR-0053**: the customer is a user with the role `customer` — there
   is no `customers` table; the trained person is the row of
   `object_assignments` (object, user); the administration assigns the
   object; a registration by QR code assigns it right away.
2. Write **ADR-0054**: the registration exists only when the e-mail channel of
   the instance is configured; it is confirmed over a link in the mail
   (`account_tokens`, purpose `registration`, 24 h, stored as a hash); the
   answer never names the address; the password is never sent; the limit of
   the public routes applies.
3. Write **ADR-0055**: the ticket carries the customer (`customer_user_id`,
   nullable, `ON DELETE SET NULL`); the customer is chosen from the trained
   people of the object; the customer is not the reporter — the reporter stays
   free text.
4. Write **ADR-0056**: the mail to the reporter is the escalation action
   `notify_reporter` — the office configures it per stage and rule; the
   opt-in of the reporter (`tickets.customer_email_notifications`) decides
   whether it goes out; the mail carries the ticket and nothing of the house.
5. Register the four decisions in the index `docs/DECISIONS.md`.
6. Name the phase 31 in the table of the phases of `PLAN.md` §16 with its exit
   criteria and add the namespace `customer` to the web namespaces of
   `PLAN.md` §3.1.

## Non-goals

- No code, no migration, no route — the decisions decide, the code follows.
- No change of the escalation actions that exist and no change of the
  channels.
- No customer data in the repository.

## Acceptance

```bash
npm run lint
npm run wp:check
```

Expected: all green; the four decisions and the plan name the same model; the
table of the phases names the phase 31.

## Handoff

- Files changed: the four decisions and the index of the decisions, the plan
- Interfaces added: ADR-0053 … ADR-0056
- Verified: the commands above
- Follow-up WP: WP-M31-02 — the specification of the customer portal
- Open question: none
