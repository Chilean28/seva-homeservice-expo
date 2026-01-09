import { UserType } from '../types/enums';
import { supabase } from './client';

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
      data: {
        full_name,
        user_type,
      },
    },
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Failed to create user');

  // Create user profile in public.users table
  const { error: profileError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      user_type,
      full_name,
      email,
    } as any);

  if (profileError) throw profileError;

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
    .single();

  // Create user profile if it doesn't exist
  if (!existingUser) {
    const { error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        user_type,
        full_name,
        phone: formattedPhone,
      } as any);

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
  return authData;
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
  const { error } = await supabase.auth.resetPasswordForEmail(email);
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
