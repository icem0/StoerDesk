-- WP-M9-03 (statistics SQL views, continues the phase-9 audit chain after WP-M9-27):
-- Plain views over the live tables; no materialized view (ADR-0012 decision 2).
-- `stats_tickets`: one row per ticket with object, workflow timestamps and the
-- ticket's summed pause seconds. `stats_ticket_faults`: one row per ticket and
-- fault_template_keys entry.

CREATE VIEW "stats_tickets" AS
SELECT
	"t"."ticket_no",
	"t"."object_id",
	"o"."object_no",
	"o"."name" AS "object_name",
	"o"."external_type" AS "system_type",
	"t"."priority",
	"t"."source",
	"t"."status",
	"t"."assigned_user_id",
	"t"."reported_at",
	"t"."review_started_at",
	"t"."first_response_at",
	"t"."acknowledged_at",
	"t"."closed_at",
	"t"."deadline_at",
	"t"."is_test",
	"t"."suspected_spam",
	COALESCE((
		SELECT SUM(EXTRACT(EPOCH FROM ("p"."ended_at" - "p"."started_at")))
		FROM "ticket_pauses" AS "p"
		WHERE "p"."ticket_id" = "t"."id"
			AND "p"."ended_at" IS NOT NULL
	), 0) AS "pause_seconds"
FROM "tickets" AS "t"
JOIN "objects" AS "o" ON "o"."id" = "t"."object_id";

CREATE VIEW "stats_ticket_faults" AS
SELECT
	"t"."id" AS "ticket_id",
	"t"."reported_at",
	"f"."fault_template_key",
	"t"."ticket_no",
	"t"."object_id",
	"o"."object_no",
	"o"."name" AS "object_name",
	"o"."external_type" AS "system_type",
	"t"."priority",
	"t"."source",
	"t"."status",
	"t"."assigned_user_id",
	"t"."review_started_at",
	"t"."first_response_at",
	"t"."acknowledged_at",
	"t"."closed_at",
	"t"."deadline_at",
	"t"."is_test",
	"t"."suspected_spam"
FROM "tickets" AS "t"
JOIN "objects" AS "o" ON "o"."id" = "t"."object_id"
CROSS JOIN LATERAL unnest("t"."fault_template_keys") AS "f"("fault_template_key");
