-- Only the `admin` system role stays protected against DELETE so it can never
-- lose all rights. Every other system role (reporter_internal, office, oncall,
-- manager) may be edited and deleted by an admin; custom roles were already
-- editable. Replaces the function body introduced by migration 0001.
CREATE OR REPLACE FUNCTION protect_system_roles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
	IF OLD.key = 'admin' THEN
		RAISE EXCEPTION 'system_role_protected: %', OLD.key USING ERRCODE = 'raise_exception';
	END IF;
	RETURN OLD;
END;
$function$;
