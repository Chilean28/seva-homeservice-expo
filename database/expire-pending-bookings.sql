-- Keep DB truth aligned for time-based booking expirations.
-- Run periodically (e.g. Supabase pg_cron every 5–15 min) as a privileged role.
--
-- Covers:
-- 1) pending requests whose worker response window expired
-- 2) accepted + price-locked bookings waiting too long for customer confirmation
--
-- Recommended pg_cron:
-- SELECT cron.schedule(
--   'expire-stale-bookings-every-10m',
--   '*/10 * * * *',
--   $$SELECT public.expire_stale_bookings();$$
-- );

CREATE OR REPLACE FUNCTION public.expire_stale_bookings()
RETURNS TABLE(expired_pending_count integer, expired_price_confirm_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending integer := 0;
  v_price_confirm integer := 0;
BEGIN
  UPDATE public.bookings
  SET status = 'cancelled'::booking_status,
      updated_at = NOW()
  WHERE status = 'pending'::booking_status
    AND response_deadline_at IS NOT NULL
    AND response_deadline_at < NOW();
  GET DIAGNOSTICS v_pending = ROW_COUNT;

  UPDATE public.bookings
  SET status = 'cancelled'::booking_status,
      updated_at = NOW()
  WHERE status = 'accepted'::booking_status
    AND price_locked_at IS NOT NULL
    AND price_confirmed_by_customer_at IS NULL
    AND price_confirmation_deadline_at IS NOT NULL
    AND price_confirmation_deadline_at < NOW();
  GET DIAGNOSTICS v_price_confirm = ROW_COUNT;

  RETURN QUERY SELECT v_pending, v_price_confirm;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_bookings() IS
  'Cancels stale pending requests and accepted bookings waiting too long for customer price confirmation.';

-- Execute once now; schedule periodically with pg_cron for continuous enforcement.
SELECT * FROM public.expire_stale_bookings();
