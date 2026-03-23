# Supabase Setup Guide

## Step 1: Environment Variables

Get your **Project URL** and **anon (public) key** from [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings** → **API**.

Create `.env` in each app (or use a setup script if you have one):

**packages/customer-app/.env**
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**packages/worker-app/.env**
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

You can copy from `.env.example` in each package:
```bash
cp packages/customer-app/.env.example packages/customer-app/.env
cp packages/worker-app/.env.example packages/worker-app/.env
# Edit both .env files with your real credentials
```

## Step 2: Database Schema and RLS

1. Open your project in the [Supabase Dashboard](https://supabase.com/dashboard) and go to **SQL Editor**.

2. **Run the schema**
   - New query → paste the contents of **`database/schema.sql`** (in this repo root).
   - Run (Cmd/Ctrl + Enter).
   - You should see "Success. No rows returned".

3. **Run the RLS policies**
   - New query → paste the contents of **`database/rls-policies.sql`**.
   - Run.
   - You should see "Success. No rows returned".

4. **Email confirmation (recommended)**
   - If **Confirm email** is enabled under **Authentication → Providers → Email**, run **`database/auth-users-insert-profile-trigger.sql`** once. It creates `public.users` when `auth.users` is created (the app cannot insert that row without a session while the user is unconfirmed).
   - Set **Authentication → URL Configuration** → **Site URL** and **Redirect URLs** so confirmation and password-reset links can open the native apps:
     - **Customer (standalone):** `sevacustomer://auth/callback` (or `sevacustomer://**`).
     - **Worker (standalone):** `sevaworker://auth/callback` (or `sevaworker://**`).
     - **Expo Go / dev:** add the URL Metro prints for `auth/callback`, e.g. `exp://YOUR_LAN:8081/--/auth/callback`, or log `Linking.createURL('auth/callback')` from the app once and paste that exact string.

5. **Standard email sign-up & sign-in (dashboard checklist)**
   - **Authentication → Providers → Email**: **Enabled**. Set **Email OTP length** (e.g. 6) and **Email OTP expiration** as you prefer.
   - **Critical — 6-digit code vs magic link:** `signInWithOtp` uses the **same** API for both. Supabase decides what the email contains from the **Magic Link** template, not from the client alone. If the template only uses `{{ .ConfirmationURL }}`, users get a **link**. To match the app’s “enter 6-digit code” signup flow, edit **Authentication → Email Templates → Magic link** and include **`{{ .Token }}`** in the body (see [Passwordless email — With OTP](https://supabase.com/docs/guides/auth/auth-magic-link#with-otp)). Example:

     ```html
     <h2>Your verification code</h2>
     <p>Enter this code in the app:</p>
     <p style="font-size: 24px; font-weight: bold;">{{ .Token }}</p>
     ```

     You can keep or remove the confirmation link; the app verifies with `verifyOtp({ email, token, type: 'email' })`.
   - In app code, do **not** pass `options.data` on `signInWithOtp` for this flow (that can switch behavior toward link-style emails) — see [Supabase discussion](https://github.com/supabase/supabase/issues/9285). The Seva apps already omit it for email OTP signup.
   - If you use **email code signup** only, you can turn **Confirm email** (link-based confirmation) **off** to avoid two different verification methods.
   - Set **minimum password length** (e.g. 6–8+) to match the app.
   - **Authentication → URL Configuration**: **Site URL** = your web app or a stable URL; **Redirect URLs** = allowed origins for magic links / email confirmation (and `exp://*` / Expo dev URLs while developing, if you use them).
   - **Authentication → Email Templates**: also customize **Confirm signup** / **Reset password** if you like (optional).
   - **Production**: configure **SMTP** (or use Supabase’s default with limits) so confirmation and password-reset emails are delivered reliably.
   - **Optional hardening**: **CAPTCHA** (e.g. Turnstile) under **Authentication → Attack Protection** if you see abuse; **rate limits** where offered.

6. **Optional – app-specific SQL**
   - **Avatars (both apps)**: run `packages/worker-app/database/storage-avatars.sql` to create the `avatars` storage bucket and policies.
   - **Worker complete profile**: create storage bucket `worker-uploads` (Public) in Dashboard → Storage, then run `packages/worker-app/database/storage-worker-uploads.sql`. If your DB was created before worker profile fields were added, run `packages/worker-app/database/worker-profile-complete.sql`.
   - **Customer app**: if you use chat, run the SQL in `packages/customer-app/database/` as needed (e.g. chat schema, RLS).

## Step 3: Verify

- In **Table Editor** you should see: `users`, `worker_profiles`, `worker_portfolio_photos`, `services`, `service_subscriptions`, `bookings`, `reviews`, `booking_photos`.
- Start an app (e.g. `pnpm customer` or `pnpm worker` from repo root) and confirm there are no Supabase connection errors.

## Troubleshooting

- **Signup says “6-digit code” but email only has a link**: Update the **Magic link** email template to include `{{ .Token }}` (see step 5 above). Default templates are link-only.
- **Connection errors**: Ensure `.env` exists in the app you’re running and restart Expo after changing env vars.
- **SQL errors**: Run `schema.sql` before `rls-policies.sql`. Enable the PostGIS extension in the dashboard if required.
- **Storage (avatars)**: Create the bucket and apply policies from `packages/worker-app/database/storage-avatars.sql` if profile photo upload is used.
