# Database (single source of truth)

Run these in your Supabase project **SQL Editor** in this order:

1. **schema.sql** – tables, enums, indexes, triggers
2. **rls-policies.sql** – Row Level Security policies
3. **chat-message-48h-window.sql** – after chat/messages RLS: only allow new messages on booking-linked conversations while `scheduled_date + 48h` is in the future (matches app “chat closed” UI).
4. **booking-worker-overlap.sql** – same worker cannot overlap pending/accepted/ongoing jobs (2-hour slots).

5. **bookings-total-amount.sql** – `total_amount` on bookings (estimate total at booking).

6. **booking-price-lock.sql** – `estimated_duration_hours`, `estimated_total`, `locked_duration_hours`, `price_locked_at` for worker price locking after job review.

7. **booking-price-customer-confirm.sql** – `price_confirmed_by_customer_at` + trigger so only the customer can set it after the worker locks the price (worker cannot start until confirmed).

8. **booking-locked-hourly-rate-note.sql** – `locked_hourly_rate` and `price_lock_note` when the worker adjusts rate and/or hours before locking the final total.

9. **worker-availability.sql** (optional) – worker schedule windows + `availability_timezone` on `worker_profiles`, plus `worker_ids_with_upcoming_availability` and `worker_ids_with_availability_in_range` (customer search filters)

10. **expire-pending-bookings.sql** (optional) – periodic `UPDATE` to set `status = cancelled` when `response_deadline_at` has passed; use if you want DB truth to match worker “expired” without relying on app-only logic

App-specific SQL (e.g. storage buckets, chat schema) lives in each app:

- **Worker app**: `packages/worker-app/database/` (e.g. `storage-avatars.sql`)
- **Customer app**: `packages/customer-app/database/` (e.g. chat schema, seeds)

When changing the core schema or RLS, update this folder first, then run in Supabase. Optionally keep `packages/*/database/schema.sql` and `rls-policies.sql` in sync or treat this folder as canonical.

## Stripe / payments (after `stripe-bookings.sql`)

- **cash-platform-fee.sql** – columns for tracking the **10% platform fee** debited from the worker’s **Stripe Connect balance** when a **cash** job is marked complete (`charge-booking-on-complete`). See **docs/STRIPE.md**.
