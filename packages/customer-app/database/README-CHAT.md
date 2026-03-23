# Chat backend (Supabase)

To make in-app chatting work, run these in the **Supabase SQL Editor** in order.

## 1. Schema and realtime

- **`chat-schema.sql`** – Creates `conversations` and `messages`, indexes, trigger, and enables **Realtime** for `messages` so new messages appear live in the app.

## 2. One conversation per booking (recommended)

- **`chat-one-per-booking.sql`** – Drops `UNIQUE(customer_id, worker_id)` on `conversations` and adds an index on `booking_id`. This lets each booking have its own chat thread; the booking detail page opens chat by `booking_id`.  
  If your schema does not have that unique constraint, the script is safe (it uses `DROP CONSTRAINT IF EXISTS` and `CREATE INDEX IF NOT EXISTS`).

## 3. Row Level Security (RLS)

- **`chat-rls.sql`** – Enables RLS on `conversations` and `messages` and adds policies so:
  - Customers can read/insert their own conversations; workers can read/insert conversations where they are the worker.
  - Only participants of a conversation can read, insert, and update (e.g. `read_at`) messages.

## Summary of what the backend provides

| Need | How it’s done |
|------|----------------|
| **Message persistence** | `messages` table: `conversation_id`, `sender_id`, `body`, `created_at`, `read_at`. |
| **Booking-scoped chats** | `conversations.booking_id`; app finds/creates conversation by `booking_id` from the booking detail page. |
| **Real-time updates** | Realtime enabled on `messages`; app subscribes to `postgres_changes` for `INSERT` on `messages` filtered by `conversation_id`. |
| **Identity** | `conversations.customer_id`, `conversations.worker_id`; `messages.sender_id`; RLS uses `auth.uid()`. |
| **Access control** | RLS policies restrict read/write to conversation participants (customer or worker). |

## Optional: voice messages and system events

- **Voice messages**: The UI has a mic button; storing audio would require an `attachment_url` (or similar) on `messages` and object storage (e.g. Supabase Storage) for the files.
- **System messages** (e.g. “Piya scheduled an appointment…”): Could be a special `sender_id` (e.g. system user) or a `message_type` column with values like `text` / `system` and a dedicated system payload.
