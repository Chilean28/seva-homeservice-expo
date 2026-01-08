# Supabase Setup Guide

Your Supabase project is already created! Here's how to complete the setup:

## ✅ Step 1: Environment Variables (Already Done!)

Your credentials are:
- **Project URL**: `https://ezyrlckumtfmsipwddld.supabase.co`
- **API Key**: `sb_publishable_5r5x4_VKlziYzzTstFFR4g_dblp-_PU`

Run the setup script to create `.env` files:
```bash
chmod +x scripts/setup-supabase.sh
./scripts/setup-supabase.sh
```

Or manually create the files:

**packages/customer-app/.env:**
```
EXPO_PUBLIC_SUPABASE_URL=https://ezyrlckumtfmsipwddld.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5r5x4_VKlziYzzTstFFR4g_dblp-_PU
```

**packages/worker-app/.env:**
```
EXPO_PUBLIC_SUPABASE_URL=https://ezyrlckumtfmsipwddld.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_5r5x4_VKlziYzzTstFFR4g_dblp-_PU
```

## 🗄️ Step 2: Set Up Database Schema

1. **Go to Supabase Dashboard**
   - Open: https://supabase.com/dashboard/project/ezyrlckumtfmsipwddld
   - Click **"SQL Editor"** in the left sidebar

2. **Run the Schema**
   - Click **"New query"**
   - Open `packages/shared/database/schema.sql` in your editor
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click **"Run"** (or press Cmd/Ctrl + Enter)
   - ✅ You should see "Success. No rows returned"

3. **Run the RLS Policies**
   - Click **"New query"** again
   - Open `packages/shared/database/rls-policies.sql` in your editor
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click **"Run"**
   - ✅ You should see "Success. No rows returned"

## ✅ Step 3: Verify Setup

1. **Check Tables**
   - Go to **"Table Editor"** in Supabase dashboard
   - You should see these tables:
     - `users`
     - `worker_profiles`
     - `services`
     - `service_subscriptions`
     - `bookings`
     - `reviews`
     - `booking_photos`

2. **Test Connection**
   ```bash
   cd packages/customer-app
   pnpm start
   ```
   - The app should start without connection errors

## 🎉 You're Done!

Your Supabase backend is now set up and ready to use. Both apps can now:
- Authenticate users
- Store and retrieve data
- Use real-time subscriptions
- Enforce security with RLS policies

## 🔍 Quick Links

- **Dashboard**: https://supabase.com/dashboard/project/ezyrlckumtfmsipwddld
- **SQL Editor**: https://supabase.com/dashboard/project/ezyrlckumtfmsipwddld/sql
- **Table Editor**: https://supabase.com/dashboard/project/ezyrlckumtfmsipwddld/editor

## 🆘 Troubleshooting

**If you get connection errors:**
- Make sure `.env` files exist in both `customer-app` and `worker-app`
- Restart Expo after creating `.env` files
- Verify your API key is correct

**If SQL fails:**
- Make sure you're running schema.sql first, then rls-policies.sql
- Check for any error messages in the SQL Editor
- Some extensions might need to be enabled manually (PostGIS)
