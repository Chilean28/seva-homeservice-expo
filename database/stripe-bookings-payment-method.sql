-- Store payment method id for card bookings paid on completion (saved card at booking time).
-- Run after stripe-bookings.sql. Safe to run multiple times.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;

COMMENT ON COLUMN public.bookings.stripe_payment_method_id IS 'Stripe PM id when customer chose saved card; charged when job is marked complete';
