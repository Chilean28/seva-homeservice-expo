-- RLS for avatars bucket. Ensure the "avatars" bucket exists (public) in Storage first.
-- Run this in Supabase SQL Editor. Safe to run multiple times: existing policies are dropped first.

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;

-- Allow authenticated users to upload/update their own avatar (path: {user_id}/...)
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read so profile picture URLs work
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
