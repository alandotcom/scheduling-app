-- Drop existing constraints (from either migration that may have been applied)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_overlapping_appointments;

-- Create trigger function
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
  -- For each resource required by this appointment type, check availability
  FOR v_resource IN
    SELECT
      atr.resource_id,
      atr.quantity_required,
      r.quantity AS total_quantity,
      r.name AS resource_name
    FROM appointment_type_resources atr
    JOIN resources r ON r.id = atr.resource_id
    WHERE atr.appointment_type_id = NEW.appointment_type_id
  LOOP
    -- Count how many of this resource are used by overlapping appointments
    SELECT COALESCE(SUM(atr2.quantity_required), 0) INTO v_used_quantity
    FROM appointments a
    JOIN appointment_type_resources atr2 ON atr2.appointment_type_id = a.appointment_type_id
    WHERE atr2.resource_id = v_resource.resource_id
      AND a.status != 'cancelled'
      AND a.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)');

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

-- Create triggers
CREATE TRIGGER check_appointment_capacity_insert
  BEFORE INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION check_appointment_capacity();

CREATE TRIGGER check_appointment_capacity_update
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    OLD.status = 'cancelled' AND NEW.status != 'cancelled'
    OR OLD.start_at != NEW.start_at
    OR OLD.end_at != NEW.end_at
    OR OLD.calendar_id != NEW.calendar_id
    OR OLD.appointment_type_id != NEW.appointment_type_id
  )
  EXECUTE FUNCTION check_appointment_capacity();

-- Index for efficient resource usage lookups
CREATE INDEX IF NOT EXISTS idx_appointments_resource_check
  ON appointments (appointment_type_id, start_at, end_at)
  WHERE status != 'cancelled';
