# WP-M14-129: the ticket number carries no calendar year — ADR-0027, the spec and the split

format: small-model
status: done
phase: 14
milestone: m14
context-budget: 20k tokens
spec: PLAN.md §6 (`tickets.ticket_no`), §7, §10 (confirmation page), §16; specs/02-data-model.md §4.8, §4.11; specs/06-report-form.md §7.3.2, §7.3.4
spec-lines: 60

depends-on: WP-M2-04, WP-M9-29, WP-M14-127

files-read:

- PLAN.md (§6 required fields, §16 current state)
- specs/02-data-model.md (§4.8 `tickets`, §4.11 `ticket_no_counters`)
- specs/06-report-form.md (§7.3.2 the number of the confirmation page)
- apps/api/src/db/migrations/0004_ticket_tables.sql (`ticket_no_counters`, `next_ticket_no()`)
- apps/api/src/db/schema.ts (`ticketNoCounters`, `tickets.ticketNo` default)
- packages/shared/src/schemas/ticket.ts (`ticketNoSchema`)

files-write:

- specs/02-data-model.md (§4.11 rewritten)
- specs/06-report-form.md (§7.3.2 rewritten)
- docs/DECISIONS.md (the ADR-0027 row)
- docs/DECISIONS/0027-ticket-number-without-year.md

interfaces:

- `next_ticket_no(): text` — unchanged name, new body: `ST-` plus a global counter
  padded to four digits, no calendar year
- `ticketNoSchema` — `^ST-\d{4,}$` or the legacy `^ST-\d{4}-\d{4,}$`
- ADR-0027 `docs/DECISIONS/0027-ticket-number-without-year.md`

## Task

**The comment of the office (out of band in phase 14).** „Der Kunde soll kein
erukstschlüsse auf die häufigkeit der Störungen nehmen können — nur eine
fortlaufende Nummer ohne die Jahreszahl am Anfang.“ The customer sees the number
on the confirmation page (§7.3.2) and on the public status page (§7.3.4);
`ST-<year>-<counter>` over a per-year counter row leaks the malfunctions of a
year and the distance between two reports of one year.

1. `specs/02-data-model.md` §4.11: the counter table becomes `ticket_no_counter`
   with one row keyed `global`, the format becomes `ST-0001`, and the section
   states that migration `0004` created the yearly table and `0048` replaced it,
   that allocated numbers are never rewritten and that the contract accepts both
   shapes.
2. `specs/06-report-form.md` §7.3.2: the number of the confirmation page is
   `ST-<counter>` without a year; the legacy shape stays valid.
3. `docs/DECISIONS.md` gains the ADR-0027 row and
   `docs/DECISIONS/0027-ticket-number-without-year.md` states the decision, the
   rejected alternatives (renumbering, hiding the year only, a counter in
   `settings`, no prefix) and the consequences.
4. `PLAN.md` §6: the `tickets.ticket_no` bullet names the year-free global
   counter; §16 records the drafted chain.
5. Split the implementation into the three children below; this package writes
   no product code.

## Non-goals

- No migration, no schema change, no contract change, no test change and no UI
  change — those belong to WP-M14-129a … WP-M14-129c.
- No statistics change: frequency stays a question of the statistics layer, never
  of a number the customer sees.
- No offset or random counter start (deferred alternative of ADR-0027).

## Acceptance

```bash
npm run wp:check
npm run check
```

Expected: green. `npm run wp:check` reads the four new documents of this
package; `npm run test:e2e` stays unverified in an environment without a
database or a browser (`PLAN.md` §18).

## Handoff

- Files changed: the two spec slices, `docs/DECISIONS.md`, the ADR-0027 file,
  `PLAN.md` §6 and §16, this file and its three children
- Interfaces added: ADR-0027, the year-free `next_ticket_no()` rule
- Verified: `npm run wp:check` (549 small-model WP, 0 failed) and `npm run check`
  green for typecheck, lint, vitest, `i18n:check` and `wp:check`; `test:e2e`
  skipped without a browser and a database — **unverified**, never green
- Follow-up WP: WP-M14-129a (the database), WP-M14-129b (the shared contract),
  WP-M14-129c (the tests) — all three files exist in this commit and run in
  numeric order
- Open question: WP-M14-121 and WP-M14-128 stay open in numeric order **before**
  this chain
