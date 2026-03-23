-- Example seed: multiple services and one booking for the first customer.
-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to run again (uses WHERE NOT EXISTS so no duplicates).

-- 1. Insert available services (only if each name doesn't exist)
INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Mounting/Assembly', 'Furniture and appliance mounting and assembly', 55.50, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Mounting/Assembly');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Cleaning', 'Home and office cleaning', 25.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Cleaning');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Handyman', 'General repairs and odd jobs', 45.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Handyman');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Plumbing', 'Plumbing repairs and installation', 65.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Plumbing');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Electrical', 'Electrical work and repairs', 70.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Electrical');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Moving', 'Moving and hauling help', 50.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Moving');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Pest Control', 'Pest inspection and treatment', 80.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Pest Control');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Landscaping', 'Lawn and garden care', 40.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Landscaping');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Painting', 'Interior and exterior painting', 55.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Painting');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Appliance Repair/Installation', 'Install and troubleshoot common home appliances', 60.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Appliance Repair/Installation');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Aircon Service (AC Cleaning)', 'Air conditioner cleaning and basic servicing', 65.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Aircon Service (AC Cleaning)');

INSERT INTO public.services (name, description, base_price, is_active)
SELECT 'Smart Home / CCTV Installation', 'Wi‑Fi, smart devices, and CCTV setup/installation', 55.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE name = 'Smart Home / CCTV Installation');
