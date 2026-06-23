-- Appointment capacity check function (location-scoped)
CREATE OR REPLACE FUNCTION check_appointment_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_capacity INTEGER;
  v_overlapping_count INTEGER;
  v_bucket_start TIMESTAMPTZ;
  v_bucket_end TIMESTAMPTZ;
  v_current_bucket TIMESTAMPTZ;
  v_lock_key BIGINT;
  v_bucket_interval INTERVAL := '15 minutes';
  v_resource RECORD;
  v_used_quantity INTEGER;
  v_calendar_location_id UUID;
  v_resource_ids UUID[];
  v_resource_id UUID;
BEGIN
  -- Skip cancelled appointments
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Get capacity for this appointment type
  SELECT COALESCE(capacity, 1) INTO v_capacity
  FROM appointment_types
  WHERE id = NEW.appointment_type_id;

  IF v_capacity IS NULL THEN
    v_capacity := 1;
  END IF;

  -- Resolve the booking calendar's location for resource scoping
  SELECT location_id INTO v_calendar_location_id
  FROM calendars
  WHERE id = NEW.calendar_id;

  -- Org-wide resources (location_id IS NULL) apply to every booking; a
  -- location-bound resource applies only when its location matches the booking
  -- calendar's location. A location-bound resource on a different-location
  -- calendar is skipped. Note: a calendar with no location (NULL) can only
  -- satisfy org-wide resources — location-bound requirements are skipped there,
  -- which the appointment-type editor surfaces as a mismatch warning.
  --
  -- KEEP THIS PREDICATE IN SYNC with the enforcement loop below. The advisory
  -- locks are acquired for exactly the resources this query selects; if the two
  -- predicates drift, concurrent bookings can over-book a resource the lock set
  -- no longer covers.
  SELECT array_agg(atr.resource_id ORDER BY atr.resource_id) INTO v_resource_ids
  FROM appointment_type_resources atr
  JOIN resources r ON r.id = atr.resource_id
  WHERE atr.appointment_type_id = NEW.appointment_type_id
    AND (r.location_id IS NULL OR r.location_id = v_calendar_location_id);

  -- Calculate bucket range that covers the appointment
  v_bucket_start := date_trunc('hour', NEW.start_at) +
    (FLOOR(EXTRACT(MINUTE FROM NEW.start_at) / 15) * v_bucket_interval);
  v_bucket_end := date_trunc('hour', NEW.end_at) +
    (FLOOR(EXTRACT(MINUTE FROM NEW.end_at) / 15) * v_bucket_interval);

  -- Acquire advisory locks for all time buckets (calendar-wide, in chronological order)
  v_current_bucket := v_bucket_start;
  WHILE v_current_bucket <= v_bucket_end LOOP
    -- Key is calendar_id + bucket (NOT appointment_type_id) for calendar-wide locking
    v_lock_key := hashtext(
      NEW.calendar_id::text || '|' ||
      EXTRACT(EPOCH FROM v_current_bucket)::text
    );

    PERFORM pg_advisory_xact_lock(v_lock_key);

    IF v_resource_ids IS NOT NULL THEN
      FOREACH v_resource_id IN ARRAY v_resource_ids LOOP
        v_lock_key := hashtext(
          v_resource_id::text || '|' ||
          EXTRACT(EPOCH FROM v_current_bucket)::text
        );
        PERFORM pg_advisory_xact_lock(v_lock_key);
      END LOOP;
    END IF;

    v_current_bucket := v_current_bucket + v_bucket_interval;
  END LOOP;

  -- Count ALL overlapping appointments on this calendar (calendar-wide, not per-type)
  SELECT COUNT(*) INTO v_overlapping_count
  FROM appointments
  WHERE calendar_id = NEW.calendar_id
    AND status != 'cancelled'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND tstzrange(start_at, end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)');

  -- Check capacity
  IF v_overlapping_count >= v_capacity THEN
    RAISE EXCEPTION 'Appointment capacity exceeded for this time slot'
      USING ERRCODE = '23P01';
  END IF;

  -- ========== RESOURCE CAPACITY CHECK ==========
  -- For each resource required by this appointment type, check availability.
  -- Org-wide resources are enforced on every calendar; location-bound resources
  -- only on calendars at their own location.
  FOR v_resource IN
    SELECT
      atr.resource_id,
      atr.quantity_required,
      r.quantity AS total_quantity,
      r.name AS resource_name,
      r.location_id AS resource_location_id
    FROM appointment_type_resources atr
    JOIN resources r ON r.id = atr.resource_id
    WHERE atr.appointment_type_id = NEW.appointment_type_id
      -- KEEP IN SYNC with the advisory-lock resource set above.
      AND (r.location_id IS NULL OR r.location_id = v_calendar_location_id)
  LOOP
    -- Count usage by overlapping appointments. An org-wide resource is a single
    -- pool shared across the whole org, so count every appointment that requires
    -- it. A location-bound resource is shared only across calendars at its own
    -- location, so count only appointments booked on those calendars.
    SELECT COALESCE(SUM(atr2.quantity_required), 0) INTO v_used_quantity
    FROM appointments a
    JOIN appointment_type_resources atr2 ON atr2.appointment_type_id = a.appointment_type_id
    LEFT JOIN calendars c ON c.id = a.calendar_id
    WHERE atr2.resource_id = v_resource.resource_id
      AND a.status != 'cancelled'
      AND a.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
      AND (
        v_resource.resource_location_id IS NULL
        OR c.location_id = v_resource.resource_location_id
      );

    -- Check if adding this appointment would exceed resource capacity
    IF v_used_quantity + v_resource.quantity_required > v_resource.total_quantity THEN
      RAISE EXCEPTION 'Resource "%" capacity exceeded (% + % > %)',
        v_resource.resource_name,
        v_used_quantity,
        v_resource.quantity_required,
        v_resource.total_quantity
        USING ERRCODE = '23P01';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Trigger: check capacity on INSERT
CREATE TRIGGER check_appointment_capacity_insert
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_capacity();
--> statement-breakpoint
-- Trigger: check capacity on UPDATE (ENUM-aware WHEN clause)
CREATE TRIGGER check_appointment_capacity_update
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    ((old.status = 'cancelled') AND (new.status <> 'cancelled'))
    OR (old.start_at <> new.start_at)
    OR (old.end_at <> new.end_at)
    OR (old.calendar_id <> new.calendar_id)
    OR (old.appointment_type_id <> new.appointment_type_id)
  )
  EXECUTE FUNCTION check_appointment_capacity();
--> statement-breakpoint
-- Index for resource capacity check queries
CREATE INDEX idx_appointments_resource_check
  ON appointments (appointment_type_id, start_at, end_at)
  WHERE (status <> 'cancelled');
