-- Add Stripe Customer ID to users so we can pass it to Checkout and show saved cards.
-- Run this in Supabase SQL Editor or via migration.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

COMMENT ON COLUMN public.users.stripe_customer_id IS 'Stripe Customer ID (cus_xxx) for payment methods and Checkout';
