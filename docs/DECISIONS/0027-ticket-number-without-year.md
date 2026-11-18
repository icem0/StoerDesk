# ADR-0027: The ticket number carries no calendar year

- Status: accepted
- Date: 2026-11-18
- Stakeholders: reporter_anon, reporter_internal, office, manager

## Context

The ticket number is a human-readable key the customer sees twice without any
further permission: on the confirmation page of the report form (§7.3.2) and on
the public status page (§7.3.4). Migration `0004_ticket_tables.sql` allocated it
as `ST-<year>-<counter>` from `ticket_no_counters`, one counter row per calendar
year, and `ticketNoSchema` (WP-M9-29, SEC-015) validates that shape at every
`:ticketNo` entry point.

The office pointed out what that format leaks: two reports in one year carry two
counter values of the same series, so a customer can read how many malfunctions
were reported in that year and how many reports happened between two of their own
reports. The frequency of the disturbances must not be reconstructable from the
number the customer sees.

## Decision

1. **One global counter row.** `ticket_no_counters` (primary key `year`) becomes
   `ticket_no_counter` with a single row keyed by the constant `global`. `next_ticket_no()`
   keeps its name and stays the column default of `tickets.ticket_no`: the
   allocation stays inside the database as an `INSERT … ON CONFLICT (key) DO UPDATE`
   with `RETURNING next_value`, so concurrent reports still never collide and no
   service has to remember the rule.
2. **The format is `ST-` plus the counter left-padded to four digits** —
   `ST-0001`, `ST-0002`, growing to five digits past 9999. The prefix stays, so
   the number is still recognisable in an API path, in a bookmark and in a log.
3. **The calendar year is gone.** A number that restarts per year and only drops
   the year from its print was rejected: two years would hand out the same
   number and break the unique index `tickets_ticket_no_key`.
4. **Existing numbers stay untouched.** A migration never rewrites an allocated
   `ticket_no`: numbers are never re-used, links and event payloads reference
   them, and the offline outbox of a client still carries an old number that has
   to replay. Migration `0048_ticket_no_counter_global.sql` replaces the table,
   seeds the global row with the highest counter the instance had already
   allocated (so a new number never counts below an old one) and redefines the
   function.
5. **The contract accepts both shapes.** `ticketNoSchema` becomes
   `^ST-\d{4,}$` **or** the legacy `^ST-\d{4}-\d{4,}$`, so an old number passes
   the format guard of the detail, workflow, delete, comment, work-order,
   escalation and privacy routes before the lookup (the SEC-015 rule of WP-M9-29
   stays intact). A number that is neither shape is rejected with
   `400 invalid_request` and never reaches the database.

## Alternatives

- **Renumber the existing tickets.** Rejected in decision 4: it invalidates
  bookmarks, status links, webhook payloads, event payloads and a queued
  `ticket_no` in a client outbox, and it re-uses numbers.
- **Keep the yearly counter and only hide the year.** Rejected in decision 3:
  uniqueness then depends on a hidden year, which the route contract and the
  unique index cannot enforce.
- **A counter in `settings`.** Rejected: `settings` is configuration the
  administration edits; an allocation counter belongs to its own table and one
  atomic row update.
- **No prefix at all.** Rejected: the number travels in URL path segments and in
  printed product text, where `ST-` keeps it identifiable.
- **A random or offset counter start.** Deferred: it hides the absolute position
  in the series, which the office did not ask for yet; the offset can be added in
  `0048` without touching the contract again.

## Consequences

- The per-year frequency and the distance between two reports of one year are no
  longer derivable from the number. The series is still monotonically increasing,
  so the position in the whole lifetime of an instance remains visible to anyone
  who compares two numbers — an offset start (the deferred alternative) closes
  that residual if the office asks for it.
- Statistics never used the number and stay unaffected; the readable key remains
  a key, not an invoice number (gaps after a rolled back transaction stay allowed).
- The shared contract, the migration test of `ticketTables.integration.spec.ts`
  and the two report E2E assertions follow in WP-M14-129a (database),
  WP-M14-129b (contract) and WP-M14-129c (tests); the map rows of migration
  `0004`, of `packages/shared/src/schemas/ticket.ts` and of the two E2E files
  follow there too.
- A migrated instance shows both shapes side by side: an old ticket keeps
  `ST-2026-0001`, a new one gets `ST-0121`.
