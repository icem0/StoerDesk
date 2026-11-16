-- An escalation rule may distribute a ticket (WP-M14-80, ADR-0026,
-- specs/07-escalation.md §7.5): the action types `offer` and `assign` become
-- legal beside `notify`, `webhook`, `history` and `status_change`. The target of
-- the action lives in the `config` jsonb (`{ target: { kind, id } }`), so no
-- column is added and an installed action row never becomes invalid — the CHECK
-- only widens. The target names a row of `oncall_pools` or of `groups`; the
-- jsonb carries no foreign key, so the configuration service of WP-M14-83
-- validates it with the `400 invalid_target` rule.

ALTER TABLE "escalation_actions" DROP CONSTRAINT "escalation_actions_type_check";
--> statement-breakpoint
ALTER TABLE "escalation_actions" ADD CONSTRAINT "escalation_actions_type_check" CHECK ("type" IN ('notify','webhook','history','status_change','offer','assign'));
