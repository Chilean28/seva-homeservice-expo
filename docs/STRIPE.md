# Stripe (sandbox) setup

## 1. Database

Run migrations so `bookings` has Stripe-related columns (see `database/stripe-bookings.sql` and follow-on `database/*.sql` for payment method, totals, etc.).

## 2. Edge Function secrets

Edge Functions need your Stripe **secret** key (never in the app).

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Edge Functions** → **Secrets** (or Project Settings → Edge Functions).
3. Add `STRIPE_SECRET_KEY` = `sk_test_...` (test mode).

Functions that charge or split payments include: `charge-saved-card`, `create-checkout-session`, `charge-booking-on-complete`, `attach-payment-method`, `cancel-booking-payment`, `get-payment-intent-from-session`, etc.

## 3. Deploy functions

Deploy the functions you use, for example:

```bash
supabase functions deploy charge-saved-card
supabase functions deploy create-checkout-session
supabase functions deploy charge-booking-on-complete
```

## 4. Customer app (publishable key)

- Set `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...` in `.env` (customer-app).

## 5. Flow (summary)

- **Cash**: Customer selects “Cash” → booking is created with `payment_method: 'cash'`, `payment_status: 'unpaid'`. No Stripe call at booking.
- **Cash — platform fee**: When the worker marks the job complete, `charge-booking-on-complete` debits **10%** of the job total from the worker’s **Stripe Connect available balance** ([Account Debits](https://docs.stripe.com/connect/account-debits))—same Connect account used for payouts, **no separate card page**. Requires Connect onboarding, Account Debits enabled in Stripe, and enough **available** balance (often from prior card jobs settling). If not, `cash_platform_fee_status` is `pending` and the worker gets a push.
- **Card (typical)**: Customer authorizes payment at booking (`payment_status: 'pending'`, PaymentIntent with capture or saved payment method). **Charge/capture** when the worker completes the job is handled by `charge-booking-on-complete` (see `database/trigger-charge-on-complete.sql` if enabled).
- **Checkout / saved card (main app paths)**: **`create-checkout-session`** (redirect / deep link return) or **`charge-saved-card`** (no redirect) with **Stripe Connect** split when `worker_profiles.stripe_connect_account_id` is set (10% platform fee in those functions). Booking detail in the customer app shows `payment_method` / `payment_status` for clarity—it is not a second checkout.
- **Other functions**: `create-payment-intent` and similar may exist for experiments or legacy paths; the **primary** customer booking payment paths are checkout + charge-saved-card unless you’ve changed deployment.

Use Stripe test cards (e.g. `4242 4242 4242 4242`) in test mode.

### Cash job fee (Connect Account Debits)

Enable **Account Debits** for your Connect platform if Stripe requires it, and obtain worker consent per [Stripe’s requirements](https://docs.stripe.com/connect/account-debits). New workers with **only** cash jobs may have **$0** Connect balance until card payouts settle—fees stay `pending` until then.
