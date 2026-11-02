CREATE TABLE "report_throttle" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"ip" "inet" NOT NULL,
	"qr_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_throttle_ip_created_at_idx" ON "report_throttle" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "report_throttle_qr_token_created_at_idx" ON "report_throttle" USING btree ("qr_token","created_at");