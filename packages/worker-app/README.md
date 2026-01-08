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

```bash
pnpm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

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
  - `/(tabs)/earnings` - Earnings overview
  - `/(tabs)/profile` - Profile settings

## Authentication

The app uses `AuthProvider` from `@seva/shared` to manage authentication state. Only users with `user_type = 'worker'` should use this app.
