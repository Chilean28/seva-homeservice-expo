// Supabase client
export * from './supabase/auth';
export type { SignInData, SignUpData, SignUpWithOTPData, VerifyOTPData } from './supabase/auth';
export { supabase } from './supabase/client';

// Types
export * from './types/database';
export * from './types/enums';

// Contexts
export { AuthProvider, useAuth } from './contexts/AuthContext';

// Utilities
export * from './utils/helpers';

// Real-time
export * from './supabase/realtime';
