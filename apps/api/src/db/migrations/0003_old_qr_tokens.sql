CREATE TABLE "old_qr_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"object_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "old_qr_tokens" ADD CONSTRAINT "old_qr_tokens_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "old_qr_tokens_token_key" ON "old_qr_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "old_qr_tokens_object_id_idx" ON "old_qr_tokens" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "old_qr_tokens_expires_at_idx" ON "old_qr_tokens" USING btree ("expires_at");