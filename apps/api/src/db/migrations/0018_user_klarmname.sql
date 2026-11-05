CREATE OR REPLACE FUNCTION derive_user_family_name(email text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  localPart TEXT := LOWER(REGEXP_REPLACE(COALESCE(email, ''), '@.*$', ''));
  cleanName TEXT := REGEXP_REPLACE(localPart, '[^[:alpha:]]', '', 'g');
BEGIN
  IF cleanName = '' THEN
    RETURN '';
  END IF;

  RETURN UPPER(SUBSTRING(cleanName, 1, 1)) || LOWER(SUBSTRING(cleanName, 2));
END;
$function$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "given_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "family_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_given_name_length_check" CHECK (LENGTH("users"."given_name") <= 64);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_family_name_length_check" CHECK (LENGTH("users"."family_name") <= 64);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_klarmname_trimmed_check" CHECK (TRIM("users"."given_name") = "users"."given_name" AND TRIM("users"."family_name") = "users"."family_name");
--> statement-breakpoint
UPDATE "users" SET "family_name" = derive_user_family_name("email") WHERE "family_name" = '';
--> statement-breakpoint
CREATE INDEX "users_name_idx" ON "users" USING btree (lower("family_name") , lower("given_name") );
