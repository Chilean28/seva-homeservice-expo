-- Push tokens for Expo push notifications (run after schema.sql).
-- One row per device; same user can have multiple tokens (e.g. phone + tablet).
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can insert/update/delete their own tokens only
CREATE POLICY "Users can manage own push tokens"
  ON public.push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role / Edge Function will need to read tokens by user_id to send push.
-- Use a service role key in the Edge Function (bypasses RLS), or add a policy that
-- allows read for authenticated if you use a different pattern.
COMMENT ON TABLE public.push_tokens IS 'Expo push tokens per user for sending push notifications';
