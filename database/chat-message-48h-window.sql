-- Close booking-linked chat 48 hours after scheduled job time (new messages blocked).
-- Run in Supabase SQL Editor after chat-rls.sql.

DROP POLICY IF EXISTS "Conversation participants can insert messages" ON public.messages;

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
      AND (
        c.booking_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.bookings bk
          WHERE bk.id = c.booking_id
          AND (bk.scheduled_date + interval '48 hours') > now()
        )
      )
    )
  );

COMMENT ON POLICY "Conversation participants can insert messages" ON public.messages IS
  'Allows messages only while within 48h after booking scheduled_date, or if conversation has no booking_id.';
