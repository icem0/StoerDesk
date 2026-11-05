--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_system_id_systems_id_fk";--> statement-breakpoint
ALTER TABLE "tickets" DROP COLUMN "system_id";--> statement-breakpoint
DROP TABLE "systems" CASCADE;
