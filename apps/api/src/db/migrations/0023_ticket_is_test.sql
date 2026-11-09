-- Test data is marked inside the data model (ADR-0012 decision 5,
-- specs/11-dashboard.md §11.3, specs/12-stats.md §12.1): the fault-free counter and
-- every statistics read exclude `is_test = true` rows by default. A ticket inserted
-- without the flag counts as real data, so the default is `false` and existing rows
-- are never backfilled. The partial index over `reported_at` for `is_test = false`
-- serves the counter range query of the dashboard snapshot.
ALTER TABLE "tickets" ADD COLUMN "is_test" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX "tickets_is_test_reported_at_idx" ON "tickets" USING btree ("reported_at") WHERE "tickets"."is_test" = false;
