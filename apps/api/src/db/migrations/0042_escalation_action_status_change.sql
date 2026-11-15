-- An escalation rule may change the status of a ticket (WP-M14-40,
-- specs/07-escalation.md §7.5): the action type `status_change` becomes legal.
-- The target status lives in the `config` jsonb (`{ toStatus }`), so no column
-- is added and an installed action row never becomes invalid — the CHECK only
-- widens. The target names a row of `ticket_statuses` and the change runs the
-- step of `ticket_transitions` (0041, ADR-0025); both rules are enforced by the
-- shared contract and the services of WP-M14-40b.

ALTER TABLE "escalation_actions" DROP CONSTRAINT "escalation_actions_type_check";
--> statement-breakpoint
ALTER TABLE "escalation_actions" ADD CONSTRAINT "escalation_actions_type_check" CHECK ("type" IN ('notify','webhook','history','status_change'));
