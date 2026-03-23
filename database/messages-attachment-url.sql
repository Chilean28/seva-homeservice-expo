-- Add optional image attachment URL to messages (for chat photos).
-- Run after chat-schema.sql.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN public.messages.attachment_url IS 'Public URL of image attachment (e.g. from chat-attachments bucket)';
