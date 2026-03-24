import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
// Reanimated not imported at root: can cause "property is not writable" in dev builds. Use only in screens that need it.
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '../lib/contexts/AuthContext';
import { PendingJobsProvider } from '../lib/contexts/PendingJobsContext';
import { UnreadChatProvider } from '../lib/contexts/UnreadChatContext';
import { useEffect, useState } from 'react';
import { router, useSegments } from 'expo-router';
import { ensureUserProfileAfterSession } from '../lib/supabase/auth';
import { handleAuthCallbackDeepLink, isAuthCallbackDeepLink } from '../lib/supabase/handleAuthDeepLink';
import { supabase } from '../lib/supabase/client';
import { ActivityIndicator, View, StyleSheet, Text, Alert, Linking, Image, LogBox } from 'react-native';

type WorkerCheck = 'idle' | 'loading' | 'allowed' | 'rejected';

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading, signOut } = useAuth();
  const segments = useSegments();
  const [workerCheck, setWorkerCheck] = useState<WorkerCheck>('idle');

  useEffect(() => {
    if (!__DEV__) return;
    LogBox.ignoreLogs([
      'TypeError: Network request failed',
      'Network request failed',
    ]);
  }, []);

  // Ensure only users with user_type = 'worker' can use the worker app
  useEffect(() => {
    if (!user?.id) {
      setWorkerCheck('idle');
      return;
    }
    setWorkerCheck('loading');
    supabase
      .from('users')
      .select('user_type')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Auth] worker check skipped due to transient error:', error.message);
          setWorkerCheck('allowed');
          return;
        }
        if (!data) {
          setWorkerCheck('allowed');
          return;
        }
        if ((data as { user_type: string }).user_type === 'worker') {
          setWorkerCheck('allowed');
        } else {
          setWorkerCheck('rejected');
        }
      });
  }, [user?.id]);

  useEffect(() => {
    if (workerCheck === 'rejected') {
      signOut().then(() => {
        Alert.alert(
          'Worker app only',
          'This app is for workers only. Please use the customer app to book services.',
          [{ text: 'OK' }]
        );
        router.replace('/(auth)/login');
      });
    }
  }, [workerCheck, signOut]);

  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    if (!segs?.length) return;

    const inAuthGroup = segs[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup && workerCheck === 'allowed') {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, workerCheck]);

  // Push: skip in Expo Go (Android SDK 53+ removed remote push). Load module only in dev build / standalone.
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return;
    if (!user?.id || workerCheck !== 'allowed') return;
    import('../lib/pushNotifications')
      .then(({ registerPushToken }) => registerPushToken(user.id))
      .catch((e) => console.warn('[Push] Registration error', e));
  }, [user?.id, workerCheck]);

  // Email confirmation deep link (sevaworker:// or exp://…/auth/callback)
  useEffect(() => {
    const handleUrl = async (event: { url: string }) => {
      const url = event?.url;
      if (!url || !isAuthCallbackDeepLink(url)) return;
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
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((u) => {
      if (u) handleUrl({ url: u });
    });
    return () => sub.remove();
  }, []);

  if (loading) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.checkingRoot}>
          <Image source={require('../assets/images/splash-icon-white-bg.png')} style={styles.loadingLogo} />
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.checkingText}>Loading…</Text>
        </View>
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  // After login, show loading while we verify user is a worker
  if (user && workerCheck === 'loading') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={styles.checkingRoot}>
          <Image source={require('../assets/images/splash-icon-white-bg.png')} style={styles.loadingLogo} />
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.checkingText}>Checking account…</Text>
        </View>
        <StatusBar style="auto" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <UnreadChatProvider>
        <PendingJobsProvider>
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="payouts" options={{ headerShown: false }} />
          <Stack.Screen name="legal/refund-policy" options={{ headerShown: false }} />
        </Stack>
        </PendingJobsProvider>
        <StatusBar style="auto" />
      </UnreadChatProvider>
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
  loadingLogo: {
    width: 96,
    height: 96,
    borderRadius: 24,
  },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
