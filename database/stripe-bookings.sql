-- Stripe payment fields on bookings (run after main schema).
-- payment_method: 'card' | 'cash'
-- payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded'

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card' CHECK (payment_method IN ('card', 'cash')),
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded')),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_payment_intent_id ON public.bookings(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON COLUMN public.bookings.payment_method IS 'card = Stripe; cash = pay on completion';
COMMENT ON COLUMN public.bookings.payment_status IS 'unpaid (cash not yet collected), pending (card auth), paid, refunded';
COMMENT ON COLUMN public.bookings.stripe_payment_intent_id IS 'Stripe PI id when paid by card';
