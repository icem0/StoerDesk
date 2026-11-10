-- Detected errors in statistics (WP-M11-05): extend `stats_tickets` with the
-- selected detected-error keys and add a fault-style view `stats_ticket_detected_errors`
-- (one row per ticket and detected_error_keys entry) so `byDetectedError`
-- can be grouped like `byFaultTemplate`.
DROP VIEW IF EXISTS "stats_tickets";
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
	"t"."detected_error_keys",
	COALESCE((
		SELECT SUM(EXTRACT(EPOCH FROM ("p"."ended_at" - "p"."started_at")))
		FROM "ticket_pauses" AS "p"
		WHERE "p"."ticket_id" = "t"."id"
			AND "p"."ended_at" IS NOT NULL
	), 0) AS "pause_seconds"
FROM "tickets" AS "t"
JOIN "objects" AS "o" ON "o"."id" = "t"."object_id";

--> statement-breakpoint
DROP VIEW IF EXISTS "stats_ticket_detected_errors";
CREATE VIEW "stats_ticket_detected_errors" AS
SELECT
	"t"."id" AS "ticket_id",
	"t"."ticket_no",
	"t"."reported_at",
	"f"."detected_error_key",
	"t"."object_id",
	"o"."object_no",
	"o"."name" AS "object_name",
	"o"."external_type" AS "system_type",
	"t"."priority",
	"t"."source",
	"t"."status",
	"t"."is_test",
	"t"."suspected_spam"
FROM "tickets" AS "t"
JOIN "objects" AS "o" ON "o"."id" = "t"."object_id"
CROSS JOIN LATERAL unnest("t"."detected_error_keys") AS "f"("detected_error_key");
