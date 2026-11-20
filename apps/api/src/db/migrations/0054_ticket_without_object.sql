-- Tickets without an object (ADR-0042, WP-M18-02, WP-M18-03).
--
-- A reserved object row „Ohne Objekt" (OHNE-OBJEKT) stands in for a foreign
-- object when the office creates an internal ticket for a customer without a
-- contract of the installation. Tickets keep object_id NOT NULL: every ticket
-- references a real object row, so all joins, the timeline, the escalation and
-- the statistics views keep working unchanged. The new nullable column
-- tickets.object_info_text stores the free description of the foreign object
-- (name, address, contact — even though it is not one of our contract
-- customers). The priority deviation of the reserved object is low
-- (object_priority_overrides, ADR-0029), so such tickets arrive with priority
-- low and a matching deadline.

INSERT INTO "objects" ("id", "object_no", "name", "street", "house_number",
  "postal_code", "city", "contact_name", "contact_phone", "contact_email",
  "qr_token", "external_id", "active", "notes", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'OHNE-OBJEKT', 'Ohne Objekt',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "object_priority_overrides" ("object_id", "priority", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'low', now(), now())
ON CONFLICT ("object_id") DO UPDATE SET
  "priority" = EXCLUDED."priority",
  "updated_at" = now();

ALTER TABLE "tickets" ADD COLUMN "object_info_text" text;
