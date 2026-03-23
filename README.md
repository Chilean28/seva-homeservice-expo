# Seva - Home Services Platform

A monorepo containing two React Native mobile applications for connecting customers with home-service workers, built with Expo and Supabase.

## 📁 Monorepo Structure

```
seva-homeservice/
├── database/                # Single source of truth: schema.sql, rls-policies.sql
├── packages/
│   ├── shared/              # Shared UI and utilities; app-specific Supabase/auth live in each app
│   ├── customer-app/        # Customer mobile app
│   └── worker-app/          # Worker mobile app
├── pnpm-workspace.yaml
└── README.md
```

## 🏗️ Architecture

- **Monorepo**: pnpm workspaces
- **Frontend**: React Native + Expo Router
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Real-time)
- **Database**: Core schema and RLS in `database/`; each app has its own Supabase client and types in `lib/`

## Limitations (v1)

Short honest scope for demos and judges (see also `docs/BUSINESS-PRESENTATION-QA.md`):

- **No separate sales-tax line** in estimates; totals reflect rate × hours and promos, not an added tax row.
- **Geo / pending pool** — location and “workers in range” rules are product-evolving; not every edge case is automated.
- **Push (`send-push`)** — intended for authenticated/internal use, not a public open endpoint.
- **`users` RLS** — tightened so profile access follows policies; still align any new tables with RLS before shipping.
- **Booking coordinates** — captured where the booking/address flow provides them.
- **Not in v1:** Stripe **webhooks** for full payment/refund/dispute sync; **full automated refunds** and Connect reversal flows.
- **Cash jobs:** Platform **fee (10%)** is debited from the worker’s **Stripe Connect balance** when they mark the job complete (see `database/cash-platform-fee.sql`; requires sufficient Connect balance / Account Debits). Tracking physical cash collection is still not reconciled in-app.
- **Optional later (needs Stripe test-mode verification):** syncing `payment_status` on the booking row after `cancel-booking-payment` cancels a PaymentIntent—only add after confirming RLS and idempotency.

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
3. Run the database in Supabase **SQL Editor** (in order):
   - Run **`database/schema.sql`**
   - Run **`database/rls-policies.sql`**

See **SUPABASE_SETUP.md** for detailed steps and optional app-specific SQL (e.g. storage for avatars).

### 3. Configure Environment Variables

Copy `.env.example` to `.env` in each app and fill in your Supabase URL and anon key:

```bash
cp packages/customer-app/.env.example packages/customer-app/.env
cp packages/worker-app/.env.example packages/worker-app/.env
# Edit both .env files with your Supabase credentials
```

Both apps use the same Supabase project but have separate `.env` files.

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

Or from the repo root:
- **Dev server:** `pnpm worker` (worker app) or `pnpm customer` (customer app).
- **Run on device/simulator:** Use the same app’s directory so the right native app launches:
  - Worker: `pnpm ios` or `pnpm android` (from root), or `pnpm worker:ios` / `pnpm worker:android`.
  - Customer: `pnpm customer:ios` or `pnpm customer:android`.

If you run `pnpm ios` from root, it now builds and runs the **worker** app. Use `pnpm customer:ios` for the customer app.

## 📦 Packages

### `@seva/shared`

Shared package for UI and utilities used by both apps. Each app has its own Supabase client, auth context, and database types in `packages/<app>/lib/`.

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

See **`database/schema.sql`** for the complete schema (single source of truth).

### Stripe (optional)

For card payments and worker payouts, run these in Supabase SQL Editor after the main schema:

- **`database/stripe-customer-id.sql`** – adds `stripe_customer_id` to `users` (saved cards and Checkout).
- **`database/stripe-connect-worker.sql`** – adds `stripe_connect_account_id` to `worker_profiles` (Connect payouts).

Set Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets: `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Customer app needs `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env`. For worker payouts (Connect Stripe), the platform must complete **Stripe Connect** signup once: [Stripe Dashboard → Connect](https://dashboard.stripe.com/connect). **Test mode:** set `STRIPE_TEST_CONNECT_ACCOUNT_ID` to your Stripe Dashboard test connected account ID (e.g. `acct_xxx`) to have all workers use that account without onboarding.

## 🔐 Authentication

Both apps use Supabase Authentication with:
- Email/password authentication
- Row Level Security (RLS) policies
- Session persistence
- Protected routes

Each app has its own **AuthProvider** in `lib/contexts/AuthContext.tsx` and handles session, redirects, and sign in/up/out.

## 📝 Development

### Adding a New Shared Utility (e.g. UI)

1. Add to `packages/shared/src/` and export from `packages/shared/src/index.ts`
2. Use in apps: `import { ... } from '@seva/shared'`

### Adding a New Database Table

1. Add SQL to **`database/schema.sql`** and RLS to **`database/rls-policies.sql`**
2. Run the new SQL in Supabase SQL Editor
3. Update TypeScript types in the app(s) that need them: `packages/<app>/lib/types/database.ts`

### Type Safety

Each app defines database types in `lib/types/database.ts`. Keep them in sync with `database/schema.sql` when you change the schema.

### Database types (Supabase generated)

After schema or RLS changes, you can regenerate TypeScript types from your Supabase project:

1. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and link or use project ID.
2. Set your project ref: `export SUPABASE_PROJECT_ID=your_project_ref` (find it in Supabase Dashboard → Project Settings → General).
3. From repo root: `pnpm supabase:types` — this writes `database/generated-types.ts`. You can then replace or merge content into `packages/customer-app/lib/types/database.ts` and `packages/worker-app/lib/types/database.ts`, or import `Database` from `database/generated-types.ts` in your Supabase client.

## 🧪 Type checking and lint

From repo root:
```bash
pnpm typecheck
pnpm lint
```

Or per app:
```bash
cd packages/customer-app && pnpm type-check
cd packages/worker-app  && pnpm type-check
```

### Before you push to Git

- Use **pnpm** only; the repo tracks **`pnpm-lock.yaml`**. Do not commit **`package-lock.json`** (it is ignored).
- Run **`pnpm typecheck`** and **`pnpm lint`** — CI runs both on pushes/PRs to `main` and `master` (see `.github/workflows/ci.yml`).
- **Never commit** real `.env` files. Commit only **`.env.example`** with placeholder keys; teammates copy to `.env` locally.
- Optional: root **`App.js`** re-exports the customer app for some Expo entry setups; day-to-day, run each app from **`packages/customer-app`** or **`packages/worker-app`** as above.
- **Private notes / scratch SQL:** `docs/private/` and **`database/local/`** are gitignored. Filenames matching **`docs/*-REVIEW.md`** are ignored (draft review docs). **Do not** ignore the main **`database/*.sql`** files if you want others to reproduce your Supabase schema.

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
