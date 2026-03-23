-- Optional: keep database status aligned with the response window (worker app already hides expired pendings in UI).
-- Run periodically (e.g. Supabase pg_cron every 5–15 min) as a privileged role, or from an Edge Function with service role.
-- Review payment/refund rules before enabling in production.

UPDATE public.bookings
SET status = 'cancelled'::booking_status,
    updated_at = NOW()
WHERE status = 'pending'::booking_status
  AND response_deadline_at IS NOT NULL
  AND response_deadline_at < NOW();

-- After this runs, customer apps that still only check `status` will see `cancelled` instead of stale `pending`.
