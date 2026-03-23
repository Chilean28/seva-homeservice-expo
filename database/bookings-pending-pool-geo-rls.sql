-- Replace broad "all pending jobs for all workers" with unassigned pool within 10 km of worker work location.
-- Prerequisites: bookings.latitude/longitude set on insert (customer flow); worker_profiles.latitude/longitude set.
-- Run in Supabase SQL Editor after main RLS. Safe to re-run: drops and recreates one policy.

DROP POLICY IF EXISTS "Workers can read pending bookings" ON public.bookings;

CREATE POLICY "Workers can read unassigned pending bookings nearby"
  ON public.bookings
  FOR SELECT
  USING (
    status = 'pending'
    AND worker_id IS NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users u
      INNER JOIN public.worker_profiles wp ON wp.user_id = u.id
      WHERE u.id = auth.uid()
        AND u.user_type = 'worker'
        AND wp.latitude IS NOT NULL
        AND wp.longitude IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography,
          ST_SetSRID(ST_MakePoint(wp.longitude::double precision, wp.latitude::double precision), 4326)::geography,
          10000
        )
    )
  );

COMMENT ON POLICY "Workers can read unassigned pending bookings nearby" ON public.bookings IS
  'Unassigned pending requests within 10 km of worker work location; assigned pending still via Workers can read assigned bookings';
