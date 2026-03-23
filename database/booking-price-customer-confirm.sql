-- Customer confirmation of worker-locked final price (required before worker can start when price is locked).
-- Run after booking-price-lock.sql. Safe to run multiple times.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS price_confirmed_by_customer_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.bookings.price_confirmed_by_customer_at IS 'When the customer confirmed the worker-locked final price; worker cannot start the job until set (when price_locked_at is set).';

-- Only the customer may set or change this column (workers could otherwise bypass via RLS).
CREATE OR REPLACE FUNCTION public.enforce_price_confirm_customer_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.price_confirmed_by_customer_at IS DISTINCT FROM OLD.price_confirmed_by_customer_at THEN
    IF auth.uid() IS DISTINCT FROM NEW.customer_id THEN
      RAISE EXCEPTION 'Only the customer can confirm the final price';
    END IF;
    IF NEW.price_confirmed_by_customer_at IS NOT NULL AND OLD.price_locked_at IS NULL THEN
      RAISE EXCEPTION 'Cannot confirm before the worker has locked the price';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_price_confirm_customer_only ON public.bookings;
CREATE TRIGGER trg_bookings_price_confirm_customer_only
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_price_confirm_customer_only();
