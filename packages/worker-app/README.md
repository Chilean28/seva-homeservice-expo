# Seva Worker App

Worker-facing mobile application for managing jobs and earnings.

## Setup

1. Copy `.env.example` to `.env`
2. Add your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=your_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key
   ```

## Running

From the worker-app package directory:

```bash
cd packages/worker-app
pnpm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

**Web:** Ensure `.env` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. If the app doesn’t load, run `npx expo start --web` from `packages/worker-app` and open the URL in your browser.

## Features

- Worker authentication
- Dashboard with job overview
- View and accept job requests
- Track earnings and payments
- Manage profile and availability
- Real-time job notifications

## Routes

- `/(auth)/login` - Sign in
- `/(auth)/signup` - Create worker account
- `/(auth)/forgot-password` - Reset password
- `/(tabs)` - Main app (protected)
  - `/(tabs)/index` - Dashboard
  - `/(tabs)/jobs` - Job management
  - `/(tabs)/availability` - Availability (open for jobs + future schedule)
  - `/(tabs)/profile/set-rates` - Hourly rates per service
  - `/(tabs)/profile` - Profile settings

## Authentication

The app uses `AuthProvider` from `@seva/shared` to manage authentication state. Only users with `user_type = 'worker'` should use this app.
