# ADR-0002: UUID v7 as the database primary key

- Status: accepted
- Date: 2026-10-28
- Stakeholders: project responsibility, API development

## Context

StörDesk uses UUIDs as primary keys (AGENTS.md, conventions). Sequential numbers are
excluded. The database is Postgres 16, and Postgres 16 provides no built-in `uuidv7()`
function (that arrives only with Postgres 18). The convention asks for "UUID v7 as the
default in the DB", i.e. server-side default generation instead of app-side IDs.

## Decision

Migration `0000_base_tables` creates the SQL function `gen_uuid_v7()` (48-bit millisecond
timestamp, version number 7, RFC 9562 variant bits, the remainder random). Every UUID
primary key of the base tables gets `DEFAULT gen_uuid_v7()`. The function is written as
`CREATE OR REPLACE` and declared `VOLATILE`, so it stays stable when the migration runs
again.

## Alternatives

- **`gen_random_uuid()` (UUID v4)**: no temporal sortability, index bloat through random
  insert points.
- **App-side generation (for example the `uuidv7` npm package)**: splits the rule between
  the API and the seeds/scripts; direct SQL access (seeds, evaluations, repairs) would
  bypass it.
- **Extension (for example `pg_uuidv7`)**: an extra installation step on the host, and not
  available everywhere (managed providers).
- **Postgres 18**: that version is not approved for operation.

## Consequences

- IDs are roughly time-sorted; indexes stay locality-friendly, and new rows can be roughly
  located through their ID range.
- Inside the same millisecond the order is not guaranteed — for the ticket timeline the
  event timestamps and the event sequences are authoritative, not the IDs.
- The function lives in the first migration. Later migrations must not undo it; changes
  happen as an additional migration.
- Tests check the version and variant bits and the temporal placement of the IDs.
