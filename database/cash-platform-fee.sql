-- Platform fee on cash jobs: debited from the worker's Stripe Connect balance (Account Debits API).
-- Run in Supabase SQL Editor after stripe-bookings.sql.
-- Workers need Stripe Connect; sufficient *available* Connect balance to cover the fee (e.g. from settled card payouts).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cash_platform_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS cash_platform_fee_status TEXT CHECK (
    cash_platform_fee_status IS NULL OR cash_platform_fee_status IN ('pending', 'charged', 'failed')
  ),
  ADD COLUMN IF NOT EXISTS cash_platform_fee_stripe_payment_intent_id TEXT;

COMMENT ON COLUMN public.bookings.cash_platform_fee_cents IS '10% of job total (cents), set when fee is attempted';
COMMENT ON COLUMN public.bookings.cash_platform_fee_status IS 'pending = owe fee / no card or charge failed; charged = PI succeeded; failed = last attempt failed';
COMMENT ON COLUMN public.bookings.cash_platform_fee_stripe_payment_intent_id IS 'Stripe id for the platform fee (Account Debit charge ch_xxx)';

CREATE INDEX IF NOT EXISTS idx_bookings_cash_platform_fee_status
  ON public.bookings (cash_platform_fee_status)
  WHERE payment_method = 'cash' AND cash_platform_fee_status IS NOT NULL;
