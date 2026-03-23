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
- Chat with workers (conversations + messages, Supabase Realtime)
- Rate workers
- Real-time booking updates

## Chat (database)

To enable chat, run in Supabase SQL Editor (after main schema):

1. `database/chat-schema.sql` – creates `conversations` and `messages`, enables Realtime for `messages`
2. `database/chat-rls.sql` – RLS policies for chat tables

If Realtime for messages doesn’t work, in Supabase Dashboard go to Database → Replication and add `messages` to the publication.

## Routes

- `/(auth)/login` - Sign in
- `/(auth)/signup` - Create account
- `/(auth)/forgot-password` - Reset password
- `/(tabs)` - Main app (protected)
  - `/(tabs)/index` - Home
  - `/(tabs)/bookings` - Bookings
  - `/(tabs)/chat` - Conversation list
  - `/(tabs)/profile` - Profile
- `/create-booking` - New booking form (from Home)
- `/conversation/[id]` - Chat thread

## Authentication

The app uses `AuthProvider` from `@seva/shared` to manage authentication state. Routes are automatically protected - unauthenticated users are redirected to login.
