// Reanimated not imported at root: RN 0.81 Text is a function component and triggers
// createAnimatedComponent(Text) InvariantViolation. Use reanimated only in screens that need it.
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '@/lib/contexts/AuthContext';
import { LocationSelectionProvider } from '@/lib/contexts/LocationSelectionContext';
import { completeBooking } from '@/lib/completeBooking';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import {
  clearPendingCardPayment,
  getPendingCardPayment,
} from '@/lib/pendingPayment';
import { Linking } from 'react-native';
import { BookingAlertsProvider } from '@/lib/contexts/BookingAlertsContext';
import { UnreadChatProvider } from '@/lib/contexts/UnreadChatContext';
import { ensureUserProfileAfterSession } from '@/lib/supabase/auth';
import { handleAuthCallbackDeepLink, isAuthCallbackDeepLink } from '@/lib/supabase/handleAuthDeepLink';
import { supabase } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { router, useSegments } from 'expo-router';

const LightTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#ffffff', card: '#ffffff' },
};
const DarkThemeWhiteBg = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#ffffff', card: '#ffffff' },
};

export const unstable_settings = {
  anchor: '(tabs)',
};

type CustomerCheck = 'idle' | 'loading' | 'allowed' | 'rejected';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading, signOut } = useAuth();
  const segments = useSegments();
  const [customerCheck, setCustomerCheck] = useState<CustomerCheck>('idle');

  // Only allow users with user_type = 'customer' in the customer app
  useEffect(() => {
    if (!user?.id) {
      setCustomerCheck('idle');
      return;
    }
    setCustomerCheck('loading');
    supabase
      .from('users')
      .select('user_type')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setCustomerCheck('rejected');
          return;
        }
        if ((data as { user_type: string }).user_type === 'customer') {
          setCustomerCheck('allowed');
        } else {
          setCustomerCheck('rejected');
        }
      });
  }, [user?.id]);

  useEffect(() => {
    if (customerCheck === 'rejected') {
      signOut().then(() => {
        Alert.alert(
          'Customer app only',
          'This app is for customers. Please use the worker app to offer services.',
          [{ text: 'OK' }]
        );
        router.replace('/(auth)/login');
      });
    }
  }, [customerCheck, signOut]);

  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    if (!segs?.length) return;

    const inAuthGroup = segs[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup && customerCheck === 'allowed') {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, customerCheck]);

  // Push: skip in Expo Go (Android SDK 53+ removed remote push). Load module only in dev build / standalone.
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    if (!user?.id || customerCheck !== 'allowed') return;
    import('@/lib/pushNotifications')
      .then(({ registerPushToken }) => registerPushToken(user.id))
      .catch((e) => console.warn('[Push] Registration error', e));
  }, [user?.id, customerCheck]);

  // Deep link: email confirmation (sevacustomer:// or exp://…/auth/callback) + Stripe payment return
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event?.url;
      if (!url) return;

      if (isAuthCallbackDeepLink(url)) {
        try {
          const res = await handleAuthCallbackDeepLink(supabase, url);
          if (res.ok) {
            await ensureUserProfileAfterSession();
          } else if (res.error) {
            Alert.alert('Email confirmation', res.error);
          }
        } catch (e) {
          console.warn('[Auth] Deep link error', e);
        }
        return;
      }

      if (!url.startsWith('sevacustomer://payment-success')) return;
      try {
        const parsed = new URL(url);
        const sessionId = parsed.searchParams.get('session_id');
        if (!sessionId) return;
        const pending = await getPendingCardPayment();
        if (!pending) return;
        // On cold start from deep link, user may not be loaded yet; use pending.userId
        if (user && pending.userId !== user.id) return;
        const { data: piData, error: piErr } = await invokeEdgeFunction<{ payment_intent_id?: string; error?: string }>(
          'get-payment-intent-from-session',
          { session_id: sessionId }
        );
        if (piErr) {
          Alert.alert('Payment', piErr);
          await clearPendingCardPayment();
          return;
        }
        const res = piData;
        if (!res?.payment_intent_id) {
          Alert.alert('Payment', res?.error || 'Invalid session.');
          await clearPendingCardPayment();
          return;
        }
        const result = await completeBooking(supabase, {
          customer_id: pending.userId,
          service_id: pending.serviceId,
          scheduled_date_iso: pending.scheduledDateIso,
          address: pending.address,
          price: pending.basePrice,
          total_amount: pending.estimateTotal,
          notes: pending.notes,
          worker_id: pending.workerId,
          latitude: pending.serviceLat,
          longitude: pending.serviceLng,
          payment_method: 'card',
          payment_status: 'pending',
          stripe_payment_intent_id: res.payment_intent_id,
        });
        await clearPendingCardPayment();
        if (result.error) {
          Alert.alert('Booking', result.error);
          return;
        }
        Alert.alert('Success', 'Your booking is confirmed. You will be charged when the worker marks the job complete.', [
          { text: 'OK', onPress: () => router.replace('/(tabs)/bookings') },
        ]);
      } catch (e) {
        console.warn('[Payment] Deep link error', e);
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, [user?.id]);

  const theme = colorScheme === 'dark' ? DarkThemeWhiteBg : LightTheme;

  if (loading) {
    return (
      <ThemeProvider value={theme}>
        <View style={styles.checkingRoot}>
          <ActivityIndicator size="large" color="#666" />
          <Text style={styles.checkingText}>Loading…</Text>
        </View>
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  if (user && customerCheck === 'loading') {
    return (
      <ThemeProvider value={theme}>
        <View style={styles.checkingRoot}>
          <ActivityIndicator size="large" color="#666" />
          <Text style={styles.checkingText}>Checking account…</Text>
        </View>
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <LocationSelectionProvider>
      <UnreadChatProvider>
      <BookingAlertsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="create-booking" options={{ headerShown: false }} />
        <Stack.Screen name="booking-address" options={{ headerShown: false }} />
        <Stack.Screen name="review-booking" options={{ headerShown: false }} />
        <Stack.Screen name="payment-methods" options={{ headerShown: false }} />
        <Stack.Screen name="worker/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="search-location" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen
          name="all-services"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
      </BookingAlertsProvider>
      </UnreadChatProvider>
      </LocationSelectionProvider>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  checkingRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    gap: 12,
  },
  checkingText: {
    fontSize: 16,
    color: '#666',
  },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
