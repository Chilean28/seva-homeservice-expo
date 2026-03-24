-- Refund flow support: customer request -> worker confirms -> Stripe refund.
-- Also tracks a reliable completion timestamp used for the 48-hour refund window.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.set_booking_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'::booking_status AND OLD.status IS DISTINCT FROM 'completed'::booking_status THEN
    NEW.completed_at = COALESCE(NEW.completed_at, NOW());
  ELSIF NEW.status IS DISTINCT FROM 'completed'::booking_status THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_completed_at ON public.bookings;
CREATE TRIGGER trg_set_booking_completed_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_completed_at();

CREATE TABLE IF NOT EXISTS public.booking_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested',
    'worker_confirmed',
    'processing',
    'succeeded',
    'failed',
    'rejected',
    'expired'
  )),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  worker_confirmed_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  stripe_refund_id TEXT,
  stripe_refund_status TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_refund_requests_booking_id
  ON public.booking_refund_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_refund_requests_worker_id
  ON public.booking_refund_requests(worker_id);
CREATE INDEX IF NOT EXISTS idx_booking_refund_requests_customer_id
  ON public.booking_refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_refund_requests_status
  ON public.booking_refund_requests(status);

DROP TRIGGER IF EXISTS update_booking_refund_requests_updated_at ON public.booking_refund_requests;
CREATE TRIGGER update_booking_refund_requests_updated_at
  BEFORE UPDATE ON public.booking_refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Booking parties can read refund requests" ON public.booking_refund_requests;
CREATE POLICY "Booking parties can read refund requests"
  ON public.booking_refund_requests
  FOR SELECT
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.worker_profiles wp
      WHERE wp.id = booking_refund_requests.worker_id
        AND wp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Customers can create refund requests within 48h" ON public.booking_refund_requests;
CREATE POLICY "Customers can create refund requests within 48h"
  ON public.booking_refund_requests
  FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_refund_requests.booking_id
        AND b.customer_id = auth.uid()
        AND b.worker_id = booking_refund_requests.worker_id
        AND b.status = 'completed'::booking_status
        AND b.payment_method = 'card'
        AND b.payment_status = 'paid'
        AND COALESCE(b.completed_at, b.updated_at) >= NOW() - INTERVAL '48 hours'
    )
  );
