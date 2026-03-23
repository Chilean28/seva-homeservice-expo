-- Allow one conversation per booking (run after chat-schema.sql if you had UNIQUE(customer_id, worker_id)).
-- This lets each booking have its own chat thread; detail page opens chat by booking_id.

-- Drop unique so we can have multiple conversations per customer-worker (one per booking)
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_customer_id_worker_id_key;

-- Speed up lookup by booking_id when opening chat from booking detail
CREATE INDEX IF NOT EXISTS idx_conversations_booking_id ON public.conversations(booking_id)
  WHERE booking_id IS NOT NULL;
