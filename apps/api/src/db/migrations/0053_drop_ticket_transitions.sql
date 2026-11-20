-- The transition table is removed (`specs/07-escalation.md` §7.13, ADR-0027).
-- A ticket status is set by the workflow event in code and by the `status_change`
-- action of an escalation stage; no step from one status to another is configured
-- or checked. The statuses themselves (`ticket_statuses`) stay: they are the
-- configured status list of WP-M14-35. The foreign keys and indexes of
-- `ticket_transitions` go with the table.

DROP TABLE IF EXISTS "ticket_transitions";
