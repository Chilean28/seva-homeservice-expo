import type { User } from '@supabase/supabase-js';
import { UserType } from '../types/enums';
import { supabase } from './client';
import { getEmailConfirmationRedirectTo } from './handleAuthDeepLink';

/**
 * When email confirmation is required, signUp() often returns session: null — the client cannot
 * INSERT into public.users (RLS needs auth.uid()). Use database/auth-users-insert-profile-trigger.sql
 * so a trigger creates the row. This fallback runs after sign-in if the row is still missing.
 */
async function ensureUserProfileRow(user: User) {
  const { data: existing, error: selErr } = await supabase
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const meta = user.user_metadata ?? {};
  const ut = meta.user_type === 'worker' || meta.user_type === 'customer' ? meta.user_type : UserType.CUSTOMER;
  const full_name = typeof meta.full_name === 'string' ? meta.full_name : '';
  const email = user.email ?? '';

  const { error } = await supabase.from('users').insert({
    id: user.id,
    user_type: ut,
    full_name,
    email,
  } as never);
  if (error) throw error;
}

export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  user_type: UserType;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface SignUpWithOTPData {
  phone: string;
  full_name: string;
  user_type: UserType;
}

export interface VerifyOTPData {
  phone: string;
  token: string;
  full_name: string;
  user_type: UserType;
}

/**
 * Format phone number to E.164 format
 * E.164 format: +[country code][number] (e.g., +13334445555)
 * Properly handles inputs like: +1-333-444-5555, (333) 444-5555, 3334445555
 */
export function formatPhoneE164(phone: string): string {
  // Remove all non-digit characters first (including from numbers starting with +)
  const cleaned = phone.replace(/\D/g, '');

  // If the original started with + and we have a valid cleaned number, prepend +
  if (phone.trim().startsWith('+') && cleaned.length >= 10) {
    return `+${cleaned}`;
  }

  // If it's 10 digits, assume US number and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // If it's 11 digits and starts with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // Otherwise, add + to the cleaned number
  return `+${cleaned}`;
}

/**
 * Sign up with email and password
 */
export async function signUp(data: SignUpData) {
  const { email, password, full_name, user_type } = data;

  // Create auth user with email and password
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getEmailConfirmationRedirectTo(),
      data: {
        full_name,
        user_type,
      },
    },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Failed to create user');

  // With "Confirm email" on, session is usually null — RLS blocks client INSERT. A DB trigger
  // (see database/auth-users-insert-profile-trigger.sql) creates public.users. If you still get a
  // session (e.g. confirmations off), create the row here or via ensureUserProfileRow on first sign-in.
  if (authData.session) {
    await ensureUserProfileRow(authData.user);
  }

  return authData;
}

export interface EmailOtpSignUpRequest {
  email: string;
}

export interface EmailOtpSignUpComplete {
  email: string;
  token: string;
  password: string;
  full_name: string;
  user_type: UserType;
}

/**
 * Send a 6-digit email code for signup.
 * Do NOT pass `options.data` here — Supabase sends a link-based email instead of an OTP when
 * `data` is set (see https://github.com/supabase/supabase/issues/9285).
 * Username/type are applied in `completeEmailOtpSignUp` via `updateUser`.
 */
export async function requestEmailOtpSignUp(data: EmailOtpSignUpRequest) {
  const { email } = data;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

/**
 * Verify email code, set password + user metadata, ensure public.users row.
 */
export async function completeEmailOtpSignUp(data: EmailOtpSignUpComplete) {
  const { email, token, password, full_name, user_type } = data;
  const trimmed = token.replace(/\s/g, '');
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: trimmed,
    type: 'email',
  });
  if (verifyError) throw verifyError;
  if (!authData.user) throw new Error('Verification failed');

  const { error: upError } = await supabase.auth.updateUser({
    password,
    data: {
      full_name,
      user_type,
    },
  });
  if (upError) throw upError;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await ensureUserProfileRow(user);
  return authData;
}

/**
 * Sign up with OTP (recommended for production)
 * User will receive an SMS with a verification code
 */
export async function signUpWithOTP(data: SignUpWithOTPData) {
  const { phone, full_name, user_type } = data;

  // Format phone to E.164
  const formattedPhone = formatPhoneE164(phone);

  // Send OTP to phone
  const { data: otpData, error: otpError } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
  });

  if (otpError) throw otpError;

  // Store user data temporarily for verification step
  // You might want to use local storage or return this to the app
  return { ...otpData, full_name, user_type, phone: formattedPhone };
}

/**
 * Verify OTP and complete signup
 */
export async function verifyOTP(data: VerifyOTPData) {
  const { phone, token, full_name, user_type } = data;

  // Format phone to E.164
  const formattedPhone = formatPhoneE164(phone);

  // Verify the OTP
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token,
    type: 'sms',
  });

  if (verifyError) throw verifyError;
  if (!authData.user) throw new Error('Failed to verify OTP');

  // Check if user profile already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', authData.user.id)
    .maybeSingle();

  // Create user profile if it doesn't exist
  if (!existingUser) {
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        user_type,
        full_name,
        email: authData.user.email ?? '',
        phone: formattedPhone,
      } as never);

    if (profileError) throw profileError;
  }

  return authData;
}

/**
 * Sign in with email and password
 */
export async function signIn(data: SignInData) {
  const { email, password } = data;

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  if (authData.user) {
    await ensureUserProfileRow(authData.user);
  }
  return authData;
}

/** Call after session is set from email confirmation deep link (not only password signIn). */
export async function ensureUserProfileAfterSession(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await ensureUserProfileRow(user);
}

/** Map Supabase auth errors for login UI */
export function loginErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    const code =
      'code' in error && (error as { code?: string }).code
        ? String((error as { code: string }).code)
        : '';
    if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
      return 'Please confirm your email first. Check your inbox for the verification link.';
    }
  }
  return 'Invalid email or password';
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Reset password (send reset email)
 */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getEmailConfirmationRedirectTo(),
  });
  if (error) throw error;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

/**
 * Get current session
 */
export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}
