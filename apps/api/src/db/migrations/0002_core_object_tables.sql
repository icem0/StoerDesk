CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"object_no" text NOT NULL,
	"name" text NOT NULL,
	"street" text,
	"house_number" text,
	"postal_code" text,
	"city" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"qr_token" text,
	"external_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"object_id" uuid NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"qr_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "systems_type_check" CHECK ("systems"."type" IN ('BMA', 'LICHTRUF', 'RWA', 'EMA', 'SPRACHALARM', 'SONSTIGE'))
);
--> statement-breakpoint
CREATE TABLE "text_template_translations" (
	"template_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "text_template_translations_pk" PRIMARY KEY("template_id","locale"),
	CONSTRAINT "text_template_translations_locale_check" CHECK ("text_template_translations"."locale" IN ('de', 'en'))
);
--> statement-breakpoint
CREATE TABLE "text_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_uuid_v7() NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_template_translations" ADD CONSTRAINT "text_template_translations_template_id_text_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."text_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "objects_object_no_lower_key" ON "objects" USING btree (lower("object_no"));--> statement-breakpoint
CREATE UNIQUE INDEX "objects_qr_token_key" ON "objects" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "objects_name_idx" ON "objects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "objects_active_idx" ON "objects" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "systems_qr_token_key" ON "systems" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "systems_object_id_idx" ON "systems" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "systems_type_idx" ON "systems" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "text_templates_key_key" ON "text_templates" USING btree ("key");