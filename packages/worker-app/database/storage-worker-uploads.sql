-- Storage bucket "worker-uploads" for ID document and portfolio photos.
-- Create the bucket in Supabase Dashboard → Storage → New bucket → name: worker-uploads, Public.
-- Then run this SQL. Safe to run multiple times.

DROP POLICY IF EXISTS "Workers can upload to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Workers can update own worker-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Workers can delete own worker-uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public read worker-uploads" ON storage.objects;

-- Path format: worker-uploads/{worker_id}/id.jpg or worker-uploads/{worker_id}/portfolio/xxx.jpg
CREATE POLICY "Workers can upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'worker-uploads'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id::text = (storage.foldername(name))[1]
      AND worker_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Workers can update own worker-uploads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'worker-uploads'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id::text = (storage.foldername(name))[1]
      AND worker_profiles.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'worker-uploads'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id::text = (storage.foldername(name))[1]
      AND worker_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Workers can delete own worker-uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'worker-uploads'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id::text = (storage.foldername(name))[1]
      AND worker_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Public read worker-uploads"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'worker-uploads');
