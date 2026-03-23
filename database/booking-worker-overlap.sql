-- Block double-booking: same worker cannot have two jobs in pending/accepted/ongoing
-- whose 2-hour slots overlap (matches customer UI "2h min" job length).
-- Run in Supabase SQL Editor after schema + RLS.
--
-- Covers: direct booking (worker_id set) + worker accepting a pool job when they already
-- have another job overlapping that time.

CREATE OR REPLACE FUNCTION public.prevent_worker_double_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_start timestamptz;
  new_end timestamptz;
BEGIN
  IF NEW.worker_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status::text NOT IN ('pending', 'accepted', 'ongoing') THEN
    RETURN NEW;
  END IF;

  new_start := NEW.scheduled_date;
  new_end := NEW.scheduled_date + interval '2 hours';

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.worker_id = NEW.worker_id
      AND b.status::text IN ('pending', 'accepted', 'ongoing')
      AND (TG_OP = 'INSERT' OR b.id <> NEW.id)
      AND b.scheduled_date < new_end
      AND (b.scheduled_date + interval '2 hours') > new_start
  ) THEN
    RAISE EXCEPTION 'This time slot is no longer available for this worker.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_worker_no_overlap ON public.bookings;
CREATE TRIGGER booking_worker_no_overlap
  BEFORE INSERT OR UPDATE OF worker_id, status, scheduled_date ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_worker_double_booking();

COMMENT ON FUNCTION public.prevent_worker_double_booking() IS
  'Rejects insert/update if worker has overlapping pending/accepted/ongoing booking (2h slots).';

-- Customer booking UI: list scheduled_date values that block new 2h jobs (same overlap rule as trigger).
-- Used to hide taken slots in the time picker before review.
CREATE OR REPLACE FUNCTION public.worker_booking_starts_for_overlap(p_worker_id uuid)
RETURNS SETOF timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.scheduled_date
  FROM public.bookings b
  WHERE b.worker_id = p_worker_id
    AND b.status::text IN ('pending', 'accepted', 'ongoing');
$$;

COMMENT ON FUNCTION public.worker_booking_starts_for_overlap(uuid) IS
  'Returns scheduled_date for active bookings on this worker; client filters 30-min slot starts that would overlap a 2h window.';

GRANT EXECUTE ON FUNCTION public.worker_booking_starts_for_overlap(uuid) TO anon, authenticated;
