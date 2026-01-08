// Supabase client
export { supabase } from './supabase/client';
export * from './supabase/auth';
export type { SignUpData, SignInData, SignUpWithOTPData, VerifyOTPData } from './supabase/auth';

// Types
export * from './types/database';
export * from './types/enums';

// Contexts
export { AuthProvider, useAuth } from './contexts/AuthContext';

// Utilities
export * from './utils/helpers';

// Real-time
export * from './supabase/realtime';
