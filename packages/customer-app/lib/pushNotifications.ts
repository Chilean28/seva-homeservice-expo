import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Database } from './types/database';
import { supabase } from './supabase/client';

type PushTokenInsert = Database['public']['Tables']['push_tokens']['Insert'];

/** Request permission and get Expo push token; save to Supabase. Call when user is logged in. */
export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) {
    console.warn('[Push] Skipped: not a physical device (simulator/emulator)');
    return;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') {
    console.warn('[Push] Skipped: notification permission not granted', final);
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const tokenResult = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });
  const token = tokenResult.data;
  if (!token) {
    console.warn('[Push] No Expo push token returned');
    return;
  }

  const platform = Platform.OS;
  const row: PushTokenInsert = {
    user_id: userId,
    expo_push_token: token,
    platform,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('push_tokens').upsert(row as never, {
    onConflict: 'expo_push_token',
  });
  if (error) {
    console.warn('[Push] Save failed:', error.message, error.code);
  } else {
    console.log('[Push] Token saved for user', userId);
  }
}
