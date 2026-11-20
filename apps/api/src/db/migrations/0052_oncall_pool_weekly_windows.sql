-- The duty windows belong to the pool (WP-M15-07, `specs/04-oncall.md` §4a.2,
-- §4a.3.2). Until now the window plan lived in the global setting
-- `oncall.weekly_windows`, so every pool shared one plan.
--
-- The column copies the stored global windows once into every active pool;
-- after that the administration maintains the windows per pool. The global
-- row is removed so no second plan can linger.
ALTER TABLE "oncall_pools" ADD COLUMN "weekly_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "oncall_pools"
SET "weekly_windows" = (
  SELECT "value" FROM "settings" WHERE "key" = 'oncall.weekly_windows'
)
WHERE "active" = true
  AND EXISTS (
    SELECT 1 FROM "settings"
    WHERE "key" = 'oncall.weekly_windows' AND jsonb_typeof("value") = 'array'
  );

DELETE FROM "settings" WHERE "key" = 'oncall.weekly_windows';
