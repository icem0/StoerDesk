-- The target of the assignment (`specs/07-escalation.md` §7.14, ADR-0057,
-- WP-M32-02): the ticket names the target its assignment was made in — a
-- readiness pool, a user group or one technician. The members of that target
-- are the list the refusal walks; the ticket carries the target in two
-- columns, so the chain needs no further table.
--
-- The columns are added without a default: an existing ticket has no
-- assignment, so its target stays NULL and no row is backfilled. The kind is
-- a closed list, the id points at no table — the jsonb of the target of the
-- assignment carries no foreign key either (the rule of §7.5).

ALTER TABLE "tickets" ADD COLUMN "assignment_target_kind" text;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "assignment_target_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignment_target_kind_check" CHECK ("tickets"."assignment_target_kind" IS NULL OR "tickets"."assignment_target_kind" IN ('pool', 'group', 'user'));
