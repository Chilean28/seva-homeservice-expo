-- Storage bucket "chat-attachments" for conversation image uploads.
-- REQUIRED: In Supabase Dashboard → Storage → New bucket:
--   - Name: chat-attachments
--   - Toggle "Public bucket" ON (otherwise chat images won't load; profile works because avatars bucket is already public).
-- Then run this SQL. Safe to run multiple times.

DROP POLICY IF EXISTS "Conversation participants can upload chat images" ON storage.objects;
DROP POLICY IF EXISTS "Public read chat-attachments" ON storage.objects;

-- Path format: chat-attachments/{conversation_id}/{uuid}.jpg
CREATE POLICY "Conversation participants can upload chat images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = c.worker_id AND wp.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Public read chat-attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'chat-attachments');
