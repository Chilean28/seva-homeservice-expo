-- Charge customer when worker marks job complete (trigger calls Edge Function; no app JWT needed).
-- 1. Enable pg_net in Supabase Dashboard: Database → Extensions → pg_net → Enable.
-- 2. Run this SQL.
-- 3. Insert your project URL and a secret (same secret as Edge Function INTERNAL_CHARGE_SECRET):
--    INSERT INTO public.charge_config (key, value) VALUES
--      ('charge_base_url', 'https://YOUR_PROJECT_REF.supabase.co'),
--      ('charge_secret', 'your-random-secret-at-least-32-chars');
-- 4. In Edge Function secrets, set INTERNAL_CHARGE_SECRET to the same value as charge_secret.

-- Config table (only trigger function owner can read; do not grant to app roles)
CREATE TABLE IF NOT EXISTS public.charge_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

REVOKE ALL ON public.charge_config FROM anon, authenticated;

COMMENT ON TABLE public.charge_config IS 'Used by charge_on_complete_trigger only; set charge_base_url and charge_secret';

-- Trigger function: when booking becomes completed, call Edge Function (charge if card+pending, notify customer)
CREATE OR REPLACE FUNCTION public.charge_on_complete_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  secret text;
  url text;
  payload jsonb;
  headers jsonb;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO base_url FROM public.charge_config WHERE key = 'charge_base_url';
  SELECT value INTO secret FROM public.charge_config WHERE key = 'charge_secret';
  IF base_url IS NULL OR secret IS NULL OR base_url = '' OR secret = '' THEN
    RETURN NEW;
  END IF;

  url := rtrim(base_url, '/') || '/functions/v1/charge-booking-on-complete';
  payload := jsonb_build_object('booking_id', NEW.id);
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-internal-secret', secret
  );

  PERFORM net.http_post(
    url := url,
    headers := headers,
    body := payload
  );

  RETURN NEW;
END;
$$;

-- Trigger on bookings
DROP TRIGGER IF EXISTS charge_on_complete ON public.bookings;
CREATE TRIGGER charge_on_complete
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.charge_on_complete_trigger();
