-- The multi-technician table is retired (`specs/07-escalation.md` §7.14,
-- ADR-0039, WP-M19-08): a ticket is handled by **one** person. The table
-- `ticket_assignees` (migration 0044) modelled a distribution to a whole pool
-- of technicians and is not written any more — the technician of the ticket is
-- `tickets.assigned_user_id`.
--
-- The rows of the old table are copied into that column before the table
-- falls: the technician of the latest row becomes the technician of the
-- ticket, so a ticket that was worked on keeps its name. The status of the
-- assignment stays NULL — the old model knew no state.

UPDATE "tickets" AS t
SET "assigned_user_id" = sub."user_id"
FROM (
  SELECT DISTINCT ON ("ticket_id") "ticket_id", "user_id"
  FROM "ticket_assignees"
  ORDER BY "ticket_id", "assigned_at" DESC
) AS sub
WHERE sub."ticket_id" = t."id" AND t."assigned_user_id" IS NULL;
--> statement-breakpoint
DROP TABLE "ticket_assignees";
