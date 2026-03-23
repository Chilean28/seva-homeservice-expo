-- Price locking: initial booking uses minimum duration (default 2h); worker can set final hours and lock total.
-- Run after bookings-total-amount.sql. Safe to run multiple times.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS estimated_duration_hours NUMERIC(10, 2) NOT NULL DEFAULT 2
    CHECK (estimated_duration_hours > 0),
  ADD COLUMN IF NOT EXISTS estimated_total DECIMAL(10, 2) CHECK (estimated_total IS NULL OR estimated_total >= 0),
  ADD COLUMN IF NOT EXISTS locked_duration_hours NUMERIC(10, 2) CHECK (locked_duration_hours IS NULL OR locked_duration_hours > 0),
  ADD COLUMN IF NOT EXISTS price_locked_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.bookings.estimated_duration_hours IS 'Hours assumed at booking (minimum block, usually 2).';
COMMENT ON COLUMN public.bookings.estimated_total IS 'Total $ estimate at booking (before worker adjustment).';
COMMENT ON COLUMN public.bookings.locked_duration_hours IS 'Final billable hours set by worker when locking price.';
COMMENT ON COLUMN public.bookings.price_locked_at IS 'When the worker locked the final price; total_amount is then the locked billable total.';

-- Backfill: existing rows use total_amount as estimate if present
UPDATE public.bookings
SET estimated_total = COALESCE(estimated_total, total_amount)
WHERE estimated_total IS NULL AND total_amount IS NOT NULL;
