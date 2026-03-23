import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { Database } from '../types/database';
import { Platform } from 'react-native';

// Create a web-safe storage adapter for Supabase
const createWebSafeStorage = () => {
  // For web platform, use localStorage with SSR guards
  if (Platform.OS === 'web') {
    return {
      getItem: async (key: string) => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(key, value);
      },
      removeItem: async (key: string) => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(key);
      },
    };
  }
  
  // For native platforms, use AsyncStorage
  return AsyncStorage;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: createWebSafeStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
