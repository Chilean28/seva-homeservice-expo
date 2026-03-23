-- Store work location as display name + map URL (like customer addresses), not just lat/long.
-- Run in Supabase SQL Editor or via migration.

ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS location_display_name TEXT,
  ADD COLUMN IF NOT EXISTS location_link TEXT;

COMMENT ON COLUMN public.worker_profiles.location_display_name IS 'Human-readable work area name (e.g. from reverse geocode)';
COMMENT ON COLUMN public.worker_profiles.location_link IS 'URL to open in maps (e.g. Google Maps link)';
