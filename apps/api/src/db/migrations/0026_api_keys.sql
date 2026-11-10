-- WP-M10-02: machine credentials of the external API (specs/08-objects-api.md §9.5,
-- ADR-0013). The plaintext token is never stored; only its SHA-256 hash and a short
-- display prefix remain.

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_token_hash_key" ON "api_keys" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "api_keys_created_at_idx" ON "api_keys" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_scopes_check" CHECK ("api_keys"."scopes" <@ ARRAY['objects:read','objects:write','tickets:read','tickets:write']::text[] AND cardinality("api_keys"."scopes") > 0);
