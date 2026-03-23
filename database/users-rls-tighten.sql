-- Tighten users SELECT: remove blanket public read; allow self, worker directory, and booking participants.
-- Run in Supabase SQL Editor after base rls-policies.sql.

DROP POLICY IF EXISTS "Public can read user profiles" ON public.users;
DROP POLICY IF EXISTS "Users readable for self workers or booking parties" ON public.users;

CREATE POLICY "Users readable for self workers or booking parties"
  ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = users.id)
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      INNER JOIN public.worker_profiles wp ON wp.id = b.worker_id
      WHERE b.customer_id = auth.uid()
        AND wp.user_id = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.customer_id = users.id
        AND b.worker_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = b.worker_id AND wp.user_id = auth.uid()
        )
    )
    OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.customer_id = users.id)
  );

COMMENT ON POLICY "Users readable for self workers or booking parties" ON public.users IS
  'Replaces public read-all: own row, any worker profile row, or counterparty on a booking.';
