-- Store Stripe Connect account id for workers so we can split payments.
-- Run in Supabase SQL Editor or via migration.

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

COMMENT ON COLUMN public.worker_profiles.stripe_connect_account_id IS 'Stripe Connect Express account ID (acct_xxx) for receiving payouts';
