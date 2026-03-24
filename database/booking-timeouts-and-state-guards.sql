-- Hardens booking lifecycle at DB level:
-- 1) Prevent accepting expired pending requests.
-- 2) Prevent moving to ongoing before customer confirms worker-locked final price.
-- 3) Add timeout for "waiting on customer price confirmation".
--
-- Run after:
--   - response-deadline-bookings.sql
--   - booking-price-lock.sql
--   - booking-price-customer-confirm.sql

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS price_confirmation_deadline_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.bookings.price_confirmation_deadline_at IS
  'Deadline for customer to confirm worker-locked final price; if passed while accepted and unconfirmed, booking should expire/cancel.';

CREATE OR REPLACE FUNCTION public.sync_price_confirmation_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Worker just locked final price and customer has not confirmed yet.
  IF NEW.price_locked_at IS NOT NULL
     AND OLD.price_locked_at IS NULL
     AND NEW.price_confirmed_by_customer_at IS NULL THEN
    NEW.price_confirmation_deadline_at :=
      COALESCE(NEW.price_confirmation_deadline_at, NEW.price_locked_at + INTERVAL '12 hours');
  END IF;

  -- If customer confirms, clear the waiting deadline.
  IF NEW.price_confirmed_by_customer_at IS NOT NULL THEN
    NEW.price_confirmation_deadline_at := NULL;
  END IF;

  -- If booking no longer in waiting-confirm state, clear stale deadline.
  IF NEW.status::text <> 'accepted'
     OR NEW.price_locked_at IS NULL
     OR NEW.price_confirmed_by_customer_at IS NOT NULL THEN
    NEW.price_confirmation_deadline_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_sync_price_confirmation_deadline ON public.bookings;
CREATE TRIGGER trg_bookings_sync_price_confirmation_deadline
  BEFORE UPDATE OF status, price_locked_at, price_confirmed_by_customer_at, price_confirmation_deadline_at
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_price_confirmation_deadline();

CREATE OR REPLACE FUNCTION public.enforce_booking_state_guards()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Do not allow accepting an expired pending request.
  IF OLD.status = 'pending'::booking_status
     AND NEW.status = 'accepted'::booking_status
     AND OLD.response_deadline_at IS NOT NULL
     AND OLD.response_deadline_at <= NOW() THEN
    RAISE EXCEPTION 'Cannot accept booking: response window has expired'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Worker cannot start (ongoing) until customer confirms locked final price.
  IF NEW.status = 'ongoing'::booking_status
     AND NEW.price_locked_at IS NOT NULL
     AND NEW.price_confirmed_by_customer_at IS NULL THEN
    RAISE EXCEPTION 'Cannot start booking before customer confirms final locked price'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_enforce_state_guards ON public.bookings;
CREATE TRIGGER trg_bookings_enforce_state_guards
  BEFORE UPDATE OF status, response_deadline_at, price_locked_at, price_confirmed_by_customer_at
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_state_guards();

-- Backfill waiting-confirm deadline for already-locked accepted rows.
UPDATE public.bookings
SET price_confirmation_deadline_at = COALESCE(
  price_confirmation_deadline_at,
  price_locked_at + INTERVAL '12 hours'
)
WHERE status = 'accepted'::booking_status
  AND price_locked_at IS NOT NULL
  AND price_confirmed_by_customer_at IS NULL;
