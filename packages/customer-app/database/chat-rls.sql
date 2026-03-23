-- RLS for chat tables. Run after chat-schema.sql.

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Conversations: customer and worker (via worker_profiles.user_id) can read/insert
CREATE POLICY "Customers can read own conversations"
  ON public.conversations
  FOR SELECT
  USING (customer_id = auth.uid());

CREATE POLICY "Workers can read own conversations"
  ON public.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = conversations.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can insert conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Workers can insert conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = conversations.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- Messages: participants can read and send
CREATE POLICY "Conversation participants can read messages"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = c.worker_id AND wp.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Conversation participants can insert messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = c.worker_id AND wp.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Conversation participants can update messages (read_at)"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = c.worker_id AND wp.user_id = auth.uid()
        )
      )
    )
  );

-- Deletion: allow participants to delete conversation threads.
-- Note: messages are deleted via ON DELETE CASCADE, but RLS still applies to the rows being deleted,
-- so we must allow DELETE on messages too.
CREATE POLICY "Customers can delete own conversations"
  ON public.conversations
  FOR DELETE
  USING (customer_id = auth.uid());

CREATE POLICY "Workers can delete own conversations"
  ON public.conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = conversations.worker_id
        AND worker_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "Conversation participants can delete messages"
  ON public.messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = c.worker_id AND wp.user_id = auth.uid()
        )
      )
    )
  );
