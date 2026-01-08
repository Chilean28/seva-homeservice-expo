# Seva - Home Services Platform

A monorepo containing two React Native mobile applications for connecting customers with home-service workers, built with Expo and Supabase.

## 📁 Monorepo Structure

```
seva-homeservice/
├── packages/
│   ├── shared/              # Shared code, types, Supabase client
│   ├── customer-app/        # Customer mobile app
│   └── worker-app/          # Worker mobile app
├── pnpm-workspace.yaml      # pnpm workspace configuration
└── README.md                # This file
```

## 🏗️ Architecture

- **Monorepo**: Managed with pnpm workspaces
- **Frontend**: React Native + Expo Router
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Real-time)
- **Shared Package**: Common types, utilities, and Supabase client

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm installed
- Expo CLI (`npm install -g expo-cli`)
- Supabase account (free tier works)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Get your project URL and anon key from Project Settings → API
3. Run the database schema:

   - Go to SQL Editor in Supabase dashboard
   - Run `packages/shared/database/schema.sql`
   - Then run `packages/shared/database/rls-policies.sql`

### 3. Configure Environment Variables

**Customer App:**
```bash
cd packages/customer-app
cp .env.example .env
# Edit .env with your Supabase credentials
```

**Worker App:**
```bash
cd packages/worker-app
cp .env.example .env
# Edit .env with your Supabase credentials
```

Both apps use the same Supabase project but have separate environment files.

### 4. Run the Apps

**Customer App:**
```bash
cd packages/customer-app
pnpm start
```

**Worker App:**
```bash
cd packages/worker-app
pnpm start
```

## 📦 Packages

### `@seva/shared`

Shared package containing:
- Supabase client configuration
- TypeScript types and interfaces
- Authentication context and helpers
- Real-time subscription helpers
- Utility functions

**Key Exports:**
- `supabase` - Supabase client instance
- `AuthProvider`, `useAuth` - Authentication context
- `UserType`, `BookingStatus` - Enums
- `User`, `Booking`, `Service`, etc. - Database types
- `signUp`, `signIn`, `signOut` - Auth functions
- Real-time subscription helpers

### `@seva/customer-app`

Customer-facing mobile application for:
- Browsing and booking services
- Managing bookings
- Rating workers
- Real-time booking updates

### `@seva/worker-app`

Worker-facing mobile application for:
- Viewing job requests
- Managing bookings
- Tracking earnings
- Updating availability

## 🗄️ Database Schema

The database includes:

- **users** - User accounts (customers and workers)
- **worker_profiles** - Worker-specific information
- **services** - Available service types
- **service_subscriptions** - Worker-service relationships
- **bookings** - Service bookings/jobs
- **reviews** - Customer reviews and ratings
- **booking_photos** - Photos uploaded for bookings

See `packages/shared/database/schema.sql` for the complete schema.

## 🔐 Authentication

Both apps use Supabase Authentication with:
- Email/password authentication
- Row Level Security (RLS) policies
- Session persistence
- Protected routes

The `AuthProvider` wraps both apps and handles:
- User session management
- Automatic redirects based on auth state
- Sign in/sign up/sign out functionality

## 🔄 Real-time Features

Real-time subscriptions are available for:
- Booking status updates (customers)
- New job requests (workers)
- Booking updates (workers)

Example usage:
```typescript
import { subscribeToCustomerBookings } from '@seva/shared';

const channel = subscribeToCustomerBookings(userId, (payload) => {
  console.log('Booking updated:', payload);
});
```

## 📝 Development

### Adding a New Shared Utility

1. Add to `packages/shared/src/utils/`
2. Export from `packages/shared/src/index.ts`
3. Use in apps: `import { yourFunction } from '@seva/shared'`

### Adding a New Database Table

1. Add SQL to `packages/shared/database/schema.sql`
2. Add RLS policies to `packages/shared/database/rls-policies.sql`
3. Update TypeScript types in `packages/shared/src/types/database.ts`
4. Run migrations in Supabase SQL Editor

### Type Safety

The shared package exports TypeScript types that match the database schema. Always use these types for consistency:

```typescript
import { Booking, User, BookingStatus } from '@seva/shared';
```

## 🧪 Testing

Run type checking:
```bash
cd packages/shared
pnpm type-check
```

## 📚 Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)

## 🛠️ Troubleshooting

### Environment Variables Not Loading

Make sure `.env` files are in the correct package directories and restart Expo.

### Supabase Connection Errors

Verify your `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are correct.

### Type Errors

Run `pnpm install` in the root to ensure workspace dependencies are linked correctly.

## 📄 License

Private project - All rights reserved
