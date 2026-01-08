import { supabase } from './client';
import { UserType } from '../types/enums';

export interface SignUpData {
  phone: string;
  password: string;
  full_name: string;
  user_type: UserType;
}

export interface SignInData {
  phone: string;
  password: string;
}

/**
 * Sign up a new user with phone and password
 */
export async function signUp(data: SignUpData) {
  const { phone, password, full_name, user_type } = data;

  // Create auth user with phone
  const { data: authData, error: authError } = await supabase.auth.signUp({
    phone,
    password,
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('Failed to create user');

  // Create user profile in public.users table
  const { error: profileError } = await supabase.from('users').insert({
    id: authData.user.id,
    user_type,
    full_name,
    phone,
  });

  if (profileError) throw profileError;

  return authData;
}

/**
 * Sign in with phone and password
 */
export async function signIn(data: SignInData) {
  const { phone, password } = data;
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    phone,
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
 * Reset password (send OTP to phone)
 */
export async function resetPassword(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({
    phone,
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
