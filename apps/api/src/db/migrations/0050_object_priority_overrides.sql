-- The priority of an object deviates from the standard (WP-M14-134a,
-- `specs/02-data-model.md` §4.3.2, ADR-0029): the table holds only the objects
-- whose priority differs from the standard `ticket.default_priority`.
--
-- The row points at the uuid of the object; the object number stays the key of
-- the object list outside the database. A row that equals the standard is not
-- stored - the table holds deviations, nothing else, and the change of the
-- standard deletes the rows that no longer deviate.
CREATE TABLE "object_priority_overrides" (
	"object_id" uuid PRIMARY KEY,
	"priority" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_priority_overrides_priority_check" CHECK ("object_priority_overrides"."priority" IN ('low', 'normal', 'high', 'critical'))
);
--> statement-breakpoint
ALTER TABLE "object_priority_overrides" ADD CONSTRAINT "object_priority_overrides_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;
