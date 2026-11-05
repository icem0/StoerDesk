-- Fix the append-only trigger on ticket_events so hard-deleting a cancelled
-- ticket can cascade its event rows. pg_trigger_depth() does not increment for
-- FK ON DELETE CASCADE, so the depth check alone never permits the cascade
-- (the depth is 1, not > 1, when the trigger fires during the cascade).
-- A SET LOCAL session variable in deleteTicket() grants the bypass.
CREATE OR REPLACE FUNCTION ticket_events_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF TG_OP = 'DELETE' THEN
		-- cascade from a hard-deleted ticket (pg_trigger_depth > 1 when called
		-- from within another trigger chain)
		IF pg_trigger_depth() > 1 THEN
			RETURN OLD;
		END IF;

		-- explicit bypass for deleteTicket() via SET LOCAL inside the transaction
		IF current_setting('stoerdesk.allow_ticket_event_delete', true) = 'true' THEN
			RETURN OLD;
		END IF;
	END IF;

	RAISE EXCEPTION 'ticket_event_append_only: %', OLD.type USING ERRCODE = 'raise_exception';
END;
$function$;
