-- Keep `users.phone` and `worker_profiles.phone` in sync for workers.
-- Canonical display/API field: `users.phone` (both apps read from `users` in chat).
-- Safe to run multiple times.
--
-- Run after schema + worker_profiles phone column (see worker-profile-complete.sql in worker-app/database).

-- 1) Backfill: copy worker_profiles.phone -> users.phone when user row is empty
UPDATE public.users u
SET phone = wp.phone
FROM public.worker_profiles wp
WHERE wp.user_id = u.id
  AND u.user_type = 'worker'::user_type
  AND wp.phone IS NOT NULL
  AND btrim(wp.phone) <> ''
  AND (u.phone IS NULL OR btrim(u.phone) = '');

-- 2) Backfill: copy users.phone -> worker_profiles.phone when profile row is empty
UPDATE public.worker_profiles wp
SET phone = u.phone
FROM public.users u
WHERE u.id = wp.user_id
  AND u.user_type = 'worker'::user_type
  AND u.phone IS NOT NULL
  AND btrim(u.phone) <> ''
  AND (wp.phone IS NULL OR btrim(wp.phone) = '');

-- 3) worker_profiles -> users (only when value differs; avoids trigger ping-pong)
CREATE OR REPLACE FUNCTION public.sync_worker_profile_phone_to_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.users u
  SET phone = NEW.phone
  WHERE u.id = NEW.user_id
    AND (u.phone IS DISTINCT FROM NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_worker_profile_phone_to_users ON public.worker_profiles;
CREATE TRIGGER trg_sync_worker_profile_phone_to_users
  AFTER INSERT OR UPDATE OF phone ON public.worker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_worker_profile_phone_to_users();

-- 4) users -> worker_profiles for workers only (only when value differs)
CREATE OR REPLACE FUNCTION public.sync_users_phone_to_worker_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_type::text IS DISTINCT FROM 'worker' THEN
    RETURN NEW;
  END IF;
  UPDATE public.worker_profiles wp
  SET phone = NEW.phone
  WHERE wp.user_id = NEW.id
    AND (wp.phone IS DISTINCT FROM NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_users_phone_to_worker_profile ON public.users;
CREATE TRIGGER trg_sync_users_phone_to_worker_profile
  AFTER UPDATE OF phone ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_users_phone_to_worker_profile();

COMMENT ON FUNCTION public.sync_worker_profile_phone_to_users() IS
  'Mirrors worker_profiles.phone into users.phone when they differ.';
COMMENT ON FUNCTION public.sync_users_phone_to_worker_profile() IS
  'Mirrors users.phone into worker_profiles.phone for workers when they differ.';
