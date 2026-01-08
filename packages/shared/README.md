# @seva/shared

Shared package for Seva home services platform. Contains common types, utilities, Supabase client, and authentication logic.

## Installation

This package is part of the monorepo and is automatically linked via pnpm workspaces.

## Usage

```typescript
import { 
  supabase, 
  useAuth, 
  AuthProvider,
  UserType,
  BookingStatus,
  subscribeToCustomerBookings 
} from '@seva/shared';
```

## Exports

### Supabase Client

```typescript
import { supabase } from '@seva/shared';

// Query data
const { data, error } = await supabase.from('bookings').select('*');
```

### Authentication

```typescript
import { useAuth, AuthProvider } from '@seva/shared';

function App() {
  return (
    <AuthProvider>
      {/* Your app */}
    </AuthProvider>
  );
}

function Component() {
  const { user, signIn, signOut } = useAuth();
  // ...
}
```

### Types

```typescript
import { User, Booking, Service, WorkerProfile } from '@seva/shared';
```

### Enums

```typescript
import { UserType, BookingStatus } from '@seva/shared';

const userType = UserType.CUSTOMER;
const status = BookingStatus.PENDING;
```

### Utilities

```typescript
import { 
  formatCurrency, 
  formatDate, 
  calculateDistance,
  isValidEmail 
} from '@seva/shared';
```

### Real-time

```typescript
import { subscribeToCustomerBookings } from '@seva/shared';

const channel = subscribeToCustomerBookings(userId, (payload) => {
  console.log('Update:', payload);
});

// Unsubscribe
unsubscribe(channel);
```

## Database Schema

See `database/schema.sql` for the complete database schema.

## Row Level Security

See `database/rls-policies.sql` for security policies.
