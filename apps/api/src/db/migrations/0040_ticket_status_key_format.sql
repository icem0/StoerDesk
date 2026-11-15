-- The ticket status administration (WP-M14-36) creates, renames and deletes
-- statuses, so the key of a status is a machine key, not one fixed value: the
-- fixed-key CHECK of migration `0034` (WP-M14-35) leaves and a key format CHECK
-- arrives instead — an upper-case identifier of up to 40 characters, the form
-- the nine statuses of `PLAN.md` §7 already use.

ALTER TABLE "ticket_statuses" DROP CONSTRAINT "ticket_statuses_key_check";
--> statement-breakpoint
ALTER TABLE "ticket_statuses" ADD CONSTRAINT "ticket_statuses_key_format_check" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{0,39}$');
