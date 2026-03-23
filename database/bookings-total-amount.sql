-- Store total amount (estimate at booking time) so cards can show total and charge uses it.
-- price remains the per-hour rate. Run after main schema. Safe to run multiple times.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) CHECK (total_amount IS NULL OR total_amount >= 0);

COMMENT ON COLUMN public.bookings.total_amount IS 'Estimate total at booking (price * hours + tax - promo); used for charge and display.';
