-- Locked hourly rate (pre-tax) at lock time + optional worker note explaining the adjustment.
-- total_amount remains hourly × locked_duration_hours (see @seva/shared computeBookingTotalFromHours).
-- Run after booking-price-customer-confirm.sql. Safe to run multiple times.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS locked_hourly_rate DECIMAL(10, 2)
    CHECK (locked_hourly_rate IS NULL OR (locked_hourly_rate >= 0 AND locked_hourly_rate <= 9999.99));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS price_lock_note TEXT
    CHECK (price_lock_note IS NULL OR char_length(price_lock_note) <= 500);

COMMENT ON COLUMN public.bookings.locked_hourly_rate IS 'Pre-tax hourly rate used when worker locked price; if null and price_locked_at set, treat as price.';
COMMENT ON COLUMN public.bookings.price_lock_note IS 'Optional short explanation from worker when locking (e.g. materials, complexity).';

-- Backfill: historical locks assumed original booking hourly rate
UPDATE public.bookings
SET locked_hourly_rate = price
WHERE price_locked_at IS NOT NULL
  AND locked_hourly_rate IS NULL;
