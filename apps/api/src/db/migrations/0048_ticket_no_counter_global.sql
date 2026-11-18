-- The ticket number carries no calendar year any more (ADR-0027): the customer
-- sees the number on the confirmation page of the report form and on the public
-- status page, so `ST-<year>-<counter>` over the per-year rows of
-- `ticket_no_counters` (migration 0004) let a customer count the malfunctions
-- of a year and the reports between two of their own reports.
--
-- One global counter row replaces the yearly rows. The allocated numbers stay
-- untouched and stay readable — `ST-2026-0001` keeps working — and the new
-- counter starts at the highest number the instance ever allocated, so a new
-- number never counts below an old one.

CREATE TABLE "ticket_no_counter" (
	"key" text PRIMARY KEY NOT NULL,
	"next_value" integer NOT NULL
);
--> statement-breakpoint
INSERT INTO "ticket_no_counter" ("key", "next_value")
SELECT 'global', COALESCE(MAX("next_value"), 0) FROM "ticket_no_counters"
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DROP TABLE "ticket_no_counters";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION next_ticket_no()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
	allocated integer;
BEGIN
	INSERT INTO ticket_no_counter (key, next_value)
	VALUES ('global', 1)
	ON CONFLICT (key) DO UPDATE SET next_value = ticket_no_counter.next_value + 1
	RETURNING next_value INTO allocated;

	RETURN 'ST-' || lpad(allocated::text, 4, '0');
END;
$function$;
