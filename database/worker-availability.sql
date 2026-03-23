-- Worker schedule: calendar dates + time ranges in the worker's chosen timezone (IANA).
-- Customers can read windows to filter booking times (convert using availability_timezone on worker_profiles).

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS availability_timezone TEXT DEFAULT 'Asia/Phnom_Penh';

COMMENT ON COLUMN public.worker_profiles.availability_timezone IS 'Fixed Cambodia (Asia/Phnom_Penh) for all availability windows; not user-selectable.';

CREATE TABLE IF NOT EXISTS public.worker_availability_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  start_minutes SMALLINT NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  end_minutes SMALLINT NOT NULL CHECK (end_minutes > start_minutes AND end_minutes <= 1440),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, work_date, start_minutes, end_minutes)
);

CREATE INDEX IF NOT EXISTS idx_worker_availability_worker_date
  ON public.worker_availability_windows(worker_id, work_date);

COMMENT ON TABLE public.worker_availability_windows IS 'Per-day availability: work_date is a calendar day in worker availability_timezone; minutes are 0-1439 from midnight that day.';

ALTER TABLE public.worker_availability_windows ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for customer booking UI; same exposure as worker profile)
CREATE POLICY "Anyone can read worker availability windows"
  ON public.worker_availability_windows
  FOR SELECT
  USING (true);

CREATE POLICY "Workers insert own availability windows"
  ON public.worker_availability_windows
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.id = worker_id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "Workers delete own availability windows"
  ON public.worker_availability_windows
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles wp
      WHERE wp.id = worker_id AND wp.user_id = auth.uid()
    )
  );

-- Customer discovery: distinct workers with at least one window on or after p_from_date.
-- Pass Cambodia calendar today (YYYY-MM-DD), same as worker_profiles.availability_timezone.
CREATE OR REPLACE FUNCTION public.worker_ids_with_upcoming_availability(p_from_date date)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT w.worker_id
  FROM public.worker_availability_windows w
  WHERE w.work_date >= p_from_date;
$$;

COMMENT ON FUNCTION public.worker_ids_with_upcoming_availability(date) IS
  'Returns worker_profile ids that have upcoming availability (work_date >= p_from_date in schedule calendar).';

GRANT EXECUTE ON FUNCTION public.worker_ids_with_upcoming_availability(date) TO anon, authenticated;

-- Customer search: date range + optional time overlap (minutes from midnight, same as windows).
CREATE OR REPLACE FUNCTION public.worker_ids_with_availability_in_range(
  p_date_start date,
  p_date_end date,
  p_time_start_minutes integer DEFAULT NULL,
  p_time_end_minutes integer DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT w.worker_id
  FROM public.worker_availability_windows w
  WHERE w.work_date >= p_date_start
    AND w.work_date <= p_date_end
    AND (
      (p_time_start_minutes IS NULL AND p_time_end_minutes IS NULL)
      OR (
        p_time_start_minutes IS NOT NULL
        AND p_time_end_minutes IS NOT NULL
        AND w.start_minutes < p_time_end_minutes
        AND w.end_minutes > p_time_start_minutes
      )
    );
$$;

COMMENT ON FUNCTION public.worker_ids_with_availability_in_range(date, date, integer, integer) IS
  'Worker profile ids with at least one window in [p_date_start, p_date_end] and optional time overlap.';

GRANT EXECUTE ON FUNCTION public.worker_ids_with_availability_in_range(date, date, integer, integer) TO anon, authenticated;
