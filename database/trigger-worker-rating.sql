-- Trigger: keep worker_profiles.rating_average in sync when reviews change.
-- Run this in Supabase SQL Editor (after schema and rls-policies).
-- Customers cannot UPDATE worker_profiles (RLS), so the rating must be updated by the DB.

CREATE OR REPLACE FUNCTION public.sync_worker_rating_average()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_worker_id uuid;
  new_avg decimal(3,2);
BEGIN
  -- Which worker to update
  IF TG_OP = 'DELETE' THEN
    target_worker_id := OLD.worker_id;
  ELSE
    target_worker_id := NEW.worker_id;
  END IF;

  SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)
  INTO new_avg
  FROM public.reviews
  WHERE worker_id = target_worker_id;

  UPDATE public.worker_profiles
  SET rating_average = new_avg,
      updated_at = now()
  WHERE id = target_worker_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_worker_rating_on_review ON public.reviews;
CREATE TRIGGER sync_worker_rating_on_review
  AFTER INSERT OR UPDATE OF rating OR DELETE
  ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_worker_rating_average();

-- One-time backfill: fix rating_average for all workers who have reviews (e.g. from before this trigger existed)
UPDATE public.worker_profiles wp
SET rating_average = sub.avg_rating,
    updated_at = now()
FROM (
  SELECT worker_id, ROUND(AVG(rating)::numeric, 2) AS avg_rating
  FROM public.reviews
  GROUP BY worker_id
) sub
WHERE wp.id = sub.worker_id;
