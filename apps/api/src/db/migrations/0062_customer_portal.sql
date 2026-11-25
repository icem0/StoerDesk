-- The data model of the customer portal (`specs/19-customer-portal.md` §19.9,
-- ADR-0053, ADR-0054, ADR-0055):
--
-- `account_tokens` holds the one-time links of the registration and of the
-- forgotten password. The plain text of the token exists once, in the mail;
-- the row holds the SHA-256 hash, so a leak of the table cannot be replayed.
--
-- `object_assignments` holds the trained person of an object — the pair of the
-- object and the customer. The pair is unique; a customer may be trained for
-- several objects and an object may have several trained people.
--
-- `tickets.customer_user_id` names the customer of the ticket. The reference
-- is `ON DELETE SET NULL`: a deleted customer leaves his tickets with their
-- history. The reporter stays free text — the customer is not the reporter.
--
-- `tickets.customer_email_notifications` is the opt-in of the reporter for the
-- messages about his ticket; the action `notify_reporter` sends only to a
-- ticket that carries it (ADR-0056).
--
-- `tickets.trained_person_confirmed` is the confirmation of the reporter that
-- he is the trained person of the installation (ADR-0055).
ALTER TABLE "users" ADD COLUMN "created_via" text DEFAULT 'admin';
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_via_check" CHECK ("users"."created_via" IN ('admin', 'registration', 'qr_registration'));
--> statement-breakpoint
CREATE TABLE "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_purpose_check" CHECK ("account_tokens"."purpose" IN ('registration', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "object_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"object_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_assignments" ADD CONSTRAINT "object_assignments_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_assignments" ADD CONSTRAINT "object_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "object_assignments" ADD CONSTRAINT "object_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "customer_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "customer_email_notifications" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "trained_person_confirmed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_tokens_token_hash_key" ON "account_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "account_tokens_user_id_idx" ON "account_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "account_tokens_expires_at_idx" ON "account_tokens" USING btree ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "object_assignments_object_id_user_id_key" ON "object_assignments" USING btree ("object_id", "user_id");
--> statement-breakpoint
CREATE INDEX "object_assignments_user_id_idx" ON "object_assignments" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "tickets_customer_user_id_idx" ON "tickets" USING btree ("customer_user_id");
