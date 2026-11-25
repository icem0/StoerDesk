-- The pool of the office is gone (`specs/07-escalation.md` §7.14, ADR-0057,
-- WP-M32-05): the assignment names a target of the installation — a readiness
-- pool, a user group or one technician. The setting of the own list of
-- technicians and the tab _Pool der Office_ are removed with it.
--
-- The actions of the escalation that named a technician become a target of the
-- kind `user`. The actions that assigned from the pool of the office cannot be
-- mapped onto a target — the pool carries no id in the installation — so they
-- are removed; the office sets a target in the administration.

DELETE FROM "settings" WHERE "key" = 'escalation.assignee_pool';
--> statement-breakpoint
UPDATE "escalation_actions"
SET "config" = jsonb_build_object(
	'target', jsonb_build_object('kind', 'user', 'id', "config"->>'user'),
	'acceptance', COALESCE("config"->'acceptance', 'true'::jsonb)
)
WHERE "type" = 'assign'
	AND "config" ? 'user'
	AND ("config"->>'user') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
	AND NOT (("config"->'target'->>'kind') IN ('pool', 'group', 'user'));
--> statement-breakpoint
DELETE FROM "escalation_actions"
WHERE "type" = 'assign'
	AND NOT (("config"->'target'->>'kind') IN ('pool', 'group', 'user'));
