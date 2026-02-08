ALTER TABLE "availability_overrides"
  ADD COLUMN "time_ranges" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "availability_overrides"
SET "time_ranges" = CASE
  WHEN "is_blocked" = true OR "start_time" IS NULL OR "end_time" IS NULL THEN '[]'::jsonb
  ELSE jsonb_build_array(
    jsonb_build_object('startTime', "start_time", 'endTime', "end_time")
  )
END;

DELETE FROM "availability_overrides" d
USING (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "calendar_id", "date"
      ORDER BY "id"
    ) AS rn
  FROM "availability_overrides"
) ranked
WHERE d."id" = ranked."id"
  AND ranked.rn > 1;

DROP INDEX IF EXISTS "availability_overrides_calendar_date_idx";

ALTER TABLE "availability_overrides"
  DROP COLUMN "start_time",
  DROP COLUMN "end_time",
  DROP COLUMN "is_blocked";

CREATE UNIQUE INDEX "availability_overrides_calendar_date_unique_idx"
  ON "availability_overrides" ("calendar_id", "date");
