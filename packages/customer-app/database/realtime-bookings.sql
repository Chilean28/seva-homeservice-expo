-- Enable Realtime for bookings (so status changes stream to customer and worker apps)
-- Run this once in Supabase Dashboard → SQL Editor.
-- If you get "already in publication", the table is already enabled.

ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
