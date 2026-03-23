-- Worker acceptance window: pending job requests expire after this many minutes.
-- TaskRabbit uses ~1 hour for same-day; 30 minutes is a reasonable default for quick response.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS response_deadline_at TIMESTAMP WITH TIME ZONE;

-- Set default on insert: now + 30 minutes (workers have 30 min to accept).
CREATE OR REPLACE FUNCTION public.set_booking_response_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.response_deadline_at IS NULL AND NEW.status = 'pending' THEN
    NEW.response_deadline_at := NOW() + INTERVAL '30 minutes';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_booking_response_deadline_trigger ON public.bookings;
CREATE TRIGGER set_booking_response_deadline_trigger
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_booking_response_deadline();

-- Backfill existing pending bookings that have no deadline (use created_at + 30 min from now for old rows, or created_at + 30 min)
UPDATE public.bookings
SET response_deadline_at = created_at + INTERVAL '30 minutes'
WHERE status = 'pending' AND response_deadline_at IS NULL;

COMMENT ON COLUMN public.bookings.response_deadline_at IS 'After this time, the pending request is considered expired; workers cannot accept.';
