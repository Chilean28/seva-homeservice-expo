-- Create public.users row when a new auth.users row is created (email confirmation flow
-- often returns no session from signUp(), so the client cannot INSERT under RLS.)
-- Run once in Supabase SQL Editor after database/schema.sql + rls-policies.
--
-- Phone/SMS-only signups may omit email; COALESCE keeps NOT NULL on public.users.email satisfied.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ut public.user_type;
  fn text;
  em text;
BEGIN
  -- Email/password signUp() sends user_type in user_metadata; phone OTP verify flow does not,
  -- so those rows are still created from the client after session exists (RLS allows INSERT).
  IF NEW.raw_user_meta_data IS NULL
     OR NOT (NEW.raw_user_meta_data ? 'user_type')
     OR NEW.raw_user_meta_data->>'user_type' NOT IN ('customer', 'worker') THEN
    RETURN NEW;
  END IF;

  fn := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  em := COALESCE(NEW.email, NEW.phone, '');

  ut := (NEW.raw_user_meta_data->>'user_type')::public.user_type;

  INSERT INTO public.users (id, user_type, full_name, email)
  VALUES (NEW.id, ut, fn, em)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
