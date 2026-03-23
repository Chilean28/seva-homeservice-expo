import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StripeConnectScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile, loading: profileLoading, refetch } = useWorkerProfile(user?.id);
  const [connecting, setConnecting] = useState(false);

  const hasStripeAccount = !!profile?.stripe_connect_account_id;

  const handleConnect = useCallback(async () => {
    if (!user?.id) return;
    setConnecting(true);
    try {
      const result = await invokeEdgeFunction<{ url?: string; error?: string; skip_onboarding?: boolean }>(
        'create-connect-onboarding-link',
        {}
      );
      setConnecting(false);
      if (result.error) {
        const msg =
          result.status === 401
            ? 'Session expired. Please sign out and sign in again, then try Connect Stripe.'
            : result.error;
        Alert.alert('Error', msg);
        return;
      }
      if (result.data?.skip_onboarding) {
        await refetch();
        return;
      }
      const rawUrl = typeof result.data?.url === 'string' ? result.data.url : '';
      const urlResult = rawUrl.replace(/\s+/g, '').replace(/[\x00-\x1f\x7f]/g, '').trim();
      const isValidUrl = urlResult.length > 10 && (urlResult.startsWith('http://') || urlResult.startsWith('https://'));
      if (!isValidUrl) {
        const msg = typeof result.data?.error === 'string' && result.data.error.trim()
          ? result.data.error.trim()
          : 'Invalid response from server. Please try again.';
        Alert.alert('Error', msg);
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(urlResult);
        await refetch();
      } catch (openErr) {
        try {
          const canOpen = await Linking.canOpenURL(urlResult);
          if (canOpen) {
            await Linking.openURL(urlResult);
            await refetch();
            return;
          }
        } catch {
          // ignore
        }
        Alert.alert(
          'Error',
          openErr instanceof Error && openErr.message?.includes('URL')
            ? 'Could not open Stripe. Please try again or use a different device.'
            : openErr instanceof Error ? openErr.message : 'Something went wrong.'
        );
      }
    } catch (e) {
      setConnecting(false);
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [user?.id, refetch]);

  return (
    <View style={styles.root}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connect Stripe</Text>
          <View style={styles.backBtn} />
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Ionicons name="wallet-outline" size={48} color="#000" style={styles.icon} />
          <Text style={styles.title}>Get paid for jobs</Text>
          <Text style={styles.body}>
            Connect and verify with Stripe in one step: accept terms, add your details, and link a bank account. You’ll
            be redirected to Stripe once; then you can receive payouts when customers pay by card.
          </Text>
          <Text style={styles.footnote}>
            Platform fee and your net payout are handled inside Stripe Connect. Job amounts shown elsewhere in the app
            may be gross—use Stripe Dashboard for fees and bank transfer timing.
          </Text>
          {hasStripeAccount && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={20} color="#34C759" />
              <Text style={styles.badgeText}>Stripe connected</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.button, (connecting || profileLoading) && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting || profileLoading}
          >
            {connecting || profileLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.buttonText}>
                {hasStripeAccount ? 'Open Stripe to complete or update' : 'Connect & verify with Stripe'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  headerWrap: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  backBtn: { width: 40 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#f8f9fa',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  icon: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 15, color: '#333', lineHeight: 22, textAlign: 'center', marginBottom: 12 },
  footnote: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  badgeText: { fontSize: 15, fontWeight: '600', color: '#2E7D32' },
  button: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9A825',
    minWidth: 200,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
