-- The mode of the `assign` action (`specs/07-escalation.md` §7.14, ADR-0039,
-- WP-M19-05): the action names its technician in the mode `user` or takes the
-- first member of the assignee pool in the mode `pool`.
--
-- An installation that was written before the mode names its target in the
-- former shape: a user target becomes the mode `user` with that technician,
-- every other target (a readiness pool, a user group) becomes the mode
-- `pool`. The flag _Annahme erforderlich_ is on — the technician answers the
-- assignment.

UPDATE "escalation_actions"
SET "config" = jsonb_build_object('mode', 'user', 'user', "config"->'target'->>'id', 'acceptance', true)
WHERE "type" = 'assign'
  AND "config" ? 'target'
  AND "config"->'target'->>'kind' = 'user';
--> statement-breakpoint
UPDATE "escalation_actions"
SET "config" = jsonb_build_object('mode', 'pool', 'acceptance', true)
WHERE "type" = 'assign'
  AND "config" ? 'target'
  AND COALESCE("config"->'target'->>'kind', '') <> 'user';
