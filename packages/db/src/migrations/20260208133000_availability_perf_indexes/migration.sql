CREATE INDEX "availability_rules_calendar_weekday_start_id_idx"
  ON "availability_rules" ("calendar_id", "weekday", "start_time", "id");

CREATE INDEX "availability_rules_calendar_id_id_idx"
  ON "availability_rules" ("calendar_id", "id");

DROP INDEX IF EXISTS "availability_rules_calendar_idx";

CREATE INDEX "availability_overrides_calendar_id_id_idx"
  ON "availability_overrides" ("calendar_id", "id");

CREATE INDEX "blocked_time_calendar_id_id_idx"
  ON "blocked_time" ("calendar_id", "id");

CREATE INDEX "scheduling_limits_calendar_id_idx"
  ON "scheduling_limits" ("calendar_id");

ANALYZE "availability_rules";
ANALYZE "availability_overrides";
ANALYZE "blocked_time";
ANALYZE "scheduling_limits";
