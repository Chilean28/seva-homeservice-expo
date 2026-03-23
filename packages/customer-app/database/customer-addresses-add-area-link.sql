-- Add area name and map link to existing customer_addresses (run on existing DBs)
ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS area_name TEXT,
  ADD COLUMN IF NOT EXISTS location_link TEXT;
