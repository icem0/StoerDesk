-- WP-M9-27 (audit SEC-013): ticket_purges is the accountability record of
-- permanently deleted tickets. Like ticket_events (0004/0017) and
-- oncall_events (0020) it must never be altered: a direct UPDATE or any
-- DELETE raises `ticket_purges_append_only`. The FK cascade that clears
-- actor_user_id when a user row is deleted updates the purge row as well;
-- that cascade is the only allowed UPDATE, recognized by comparing every
-- other field of OLD and NEW (FK cascades fire at trigger depth 1, see
-- 0017 — no depth assumption here). A BEFORE INSERT trigger caps `reason`
-- at 1000 characters at the database level so a raw write path cannot store
-- an unbounded text; the exception names the code only, the reason text is
-- PII and never part of a message.
CREATE OR REPLACE FUNCTION ticket_purges_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF TG_OP = 'UPDATE' AND NEW.actor_user_id IS NULL
		AND NEW.ticket_no = OLD.ticket_no
		AND NEW.object_no = OLD.object_no
		AND NEW.deleted_events_count = OLD.deleted_events_count
		AND NEW.deleted_photos_count = OLD.deleted_photos_count
		AND COALESCE(NEW.reason, '') = COALESCE(OLD.reason, '')
		AND NEW.created_at = OLD.created_at THEN
		-- FK cascade of a deleted user: only actor_user_id is cleared,
		-- the log itself stays untouched
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'ticket_purges_append_only: %', TG_OP USING ERRCODE = 'raise_exception';
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER ticket_purges_is_append_only
	BEFORE UPDATE OR DELETE ON "ticket_purges"
	FOR EACH ROW
	EXECUTE FUNCTION ticket_purges_append_only();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ticket_purges_reason_length()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF TG_OP = 'INSERT' AND NEW.reason IS NOT NULL AND LENGTH(NEW.reason) > 1000 THEN
		RAISE EXCEPTION 'ticket_purges_reason_too_long' USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER ticket_purges_reason_is_bounded
	BEFORE INSERT ON "ticket_purges"
	FOR EACH ROW
	EXECUTE FUNCTION ticket_purges_reason_length();
