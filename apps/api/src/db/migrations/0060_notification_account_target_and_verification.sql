-- The target and the confirmation of the accounts of the users
-- (`specs/10-notifications.md` §11.3, §11.3a, ADR-0045):
--
-- `target` is the target of the user at the channel — the room of the user for
-- Matrix, empty for every other kind. `verified_at` is the time of the
-- confirmation of the account: the user proved that the address works with a
-- one-time code over the channel itself.
--
-- A column that is added is added with its default, so the rows of the older
-- version keep their accounts: an account without a target stays the account
-- of the installation and an account without a confirmation is *linked*, not
-- *set up*.
ALTER TABLE "notification_accounts" ADD COLUMN "target" text DEFAULT '';
--> statement-breakpoint
ALTER TABLE "notification_accounts" ADD COLUMN "verified_at" timestamp;
