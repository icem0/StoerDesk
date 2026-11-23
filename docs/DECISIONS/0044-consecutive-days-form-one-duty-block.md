# ADR-0044: Consecutive days with the same duty window form one block

- Status: accepted
- Date: 2026-11-23
- Stakeholders: admin, office, on-call technicians
- Amends: ADR-0040 (decision 3)

## Context

ADR-0040 makes a duty block the unit of the plan: one block is one shift per
week, and the technician confirms it once. The plan of a pool that was written
before ADR-0040 is in the older form of ADR-0035 — one entry per weekday
(`weekday`, `start`, `end`). A pool with the office plan of ADR-0035 — Monday
to Thursday 07:30–17:00 and Friday 07:00–12:00 — therefore holds five entries
and creates five shifts a week, so the technician confirms five shifts for one
duty.

The administration of the current version writes blocks, but a pool that was
filled before keeps its old entries until an admin edits it by hand. The
entries describe exactly the duty the blocks describe: the same weekdays with
the same daily window. Nothing but the shape of the plan differs.

## Decision

1. **The plan of a pool is normalised.** Blocks that share the same daily
   window and lie on consecutive weekdays of the week of Monday to Sunday
   become one block. The weekdays in between must not be covered by another
   block; a block that is separated from its neighbour by a covered weekday
   stays as it is.
2. **The normalisation never changes the duty.** The covered weekdays and the
   daily window stay the same; only the number of blocks changes. A block of
   the plan keeps the meaning of its pattern.
3. **The normalisation happens where the plan is read and written.** The
   answer of the pool list and the plan of the generator use the normalised
   blocks, and a plan that is written is stored normalised. A pool that was
   filled before therefore shows and creates blocks without a migration.
4. **An ambiguous plan stays as it is.** If two blocks cover the same weekday
   with different daily windows, the plan is contradictory; the normalisation
   returns it unchanged and the administration resolves it.
5. **The existing shifts are not touched.** The shifts of the old plan stay as
   they are (§4a.9); the admin deletes them and generates the blocks.

## Alternatives

- **A migration that rewrites the stored plans:** rejected. The normalisation
  at the read and the write path reaches the same result without touching a
  row of a table and without a rollback of a migration.
- **The office edits every pool by hand:** rejected. The plan of ADR-0035 is
  the shape the office knows; it must not need a second manual step.
- **The blocks keep the day windows as they are:** rejected. Then a pool with
  the office plan keeps five shifts a week and five confirmations — the
  complaint of the office that led to ADR-0040.

## Consequences

- A pool of the older version shows its plan as blocks in the administration
  and creates one shift per block per week.
- The shift of the older version stays until the admin deletes it; the
  confirmation of the technician is per shift and does not change.
- The plan of the pool without blocks is still the continuous plan of
  ADR-0011; the normalisation does not touch it.
