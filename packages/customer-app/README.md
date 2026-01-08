# Seva Customer App

Customer-facing mobile application for booking home services.

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

- User authentication (sign up, sign in, password reset)
- Browse services
- Book services
- View booking history
- Rate workers
- Real-time booking updates

## Routes

- `/(auth)/login` - Sign in
- `/(auth)/signup` - Create account
- `/(auth)/forgot-password` - Reset password
- `/(tabs)` - Main app (protected)
  - `/(tabs)/index` - Home/Explore
  - `/(tabs)/explore` - Browse services

## Authentication

The app uses `AuthProvider` from `@seva/shared` to manage authentication state. Routes are automatically protected - unauthenticated users are redirected to login.
