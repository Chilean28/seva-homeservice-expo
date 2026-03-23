-- Complete profile: phone, ID document, portfolio photos (run on existing DB)
-- Create storage bucket "worker-uploads" in Supabase Dashboard (Storage) if it doesn't exist.
-- worker_profiles: add phone and ID fields (id_document not shown on public profile)
ALTER TABLE public.worker_profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS id_uploaded_at TIMESTAMP WITH TIME ZONE;

-- Portfolio photos (past work) - shown on public profile
CREATE TABLE IF NOT EXISTS public.worker_portfolio_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_portfolio_photos_worker_id ON public.worker_portfolio_photos(worker_id);

-- RLS: workers can manage their own portfolio photos
ALTER TABLE public.worker_portfolio_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workers can read own portfolio photos" ON public.worker_portfolio_photos;
CREATE POLICY "Workers can read own portfolio photos"
  ON public.worker_portfolio_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = worker_portfolio_photos.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workers can insert own portfolio photos" ON public.worker_portfolio_photos;
CREATE POLICY "Workers can insert own portfolio photos"
  ON public.worker_portfolio_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = worker_portfolio_photos.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Workers can delete own portfolio photos" ON public.worker_portfolio_photos;
CREATE POLICY "Workers can delete own portfolio photos"
  ON public.worker_portfolio_photos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = worker_portfolio_photos.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- Anyone can read portfolio photos (for public worker profile)
DROP POLICY IF EXISTS "Public can read portfolio photos" ON public.worker_portfolio_photos;
CREATE POLICY "Public can read portfolio photos"
  ON public.worker_portfolio_photos FOR SELECT
  USING (true);
