import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
} from '@seva/shared';
import { useAuth } from '@/lib/contexts/AuthContext';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PayoutItem = {
  id: string;
  amount_cents: number;
  status: string;
  arrival_date: number;
  created: number;
  currency: string;
};

type PayoutsData = {
  available_cents?: number;
  pending_cents?: number;
  payouts?: PayoutItem[];
  error?: string;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Root-level screen (not under Profile stack) so back returns to whichever tab opened this. */
export default function PayoutsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const goBack = useCallback(() => {
    router.back();
  }, []);

  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayouts = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const result = await invokeEdgeFunction<PayoutsData>('get-connect-payouts', {});
      if (result.error) {
        setError(result.error);
        setData(null);
        return;
      }
      setData(result.data ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const noAccount = data?.error === 'No Stripe account connected';

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payouts</Text>
          <View style={styles.headerBack} />
        </View>
      </View>

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error && !data ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : noAccount || data?.error === 'No Stripe account connected' ? (
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="wallet-outline" size={64} color={APP_SCREEN_HEADER_BG} />
          </View>
          <Text style={styles.title}>Receive your earnings</Text>
          <Text style={styles.body}>
            Connect your Stripe account to get paid for completed tasks. Payouts are sent securely via
            Stripe Connect.
          </Text>
          <TouchableOpacity
            style={styles.connectBtn}
            onPress={() => router.push('/(tabs)/profile/stripe-connect')}
            activeOpacity={0.8}
          >
            <Text style={styles.connectBtnText}>Connect Stripe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchPayouts(true)} tintColor="#000" />
          }
        >
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceValue}>
              {formatCents(data?.available_cents ?? 0)}
            </Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Pending</Text>
            <Text style={styles.balanceValue}>{formatCents(data?.pending_cents ?? 0)}</Text>
          </View>
          <Text style={styles.balanceDisclaimer}>
            Amounts here are your Stripe Connect balance. Job totals elsewhere in the app are gross; platform fee
            and bank payout timing are handled in Stripe Connect.
          </Text>

          <Text style={styles.sectionTitle}>Recent payouts</Text>
          {!data?.payouts?.length ? (
            <Text style={styles.emptyText}>No payouts yet.</Text>
          ) : (
            data.payouts.map((p) => (
              <View key={p.id} style={styles.payoutRow}>
                <View style={styles.payoutLeft}>
                  <Text style={styles.payoutAmount}>{formatCents(p.amount_cents)}</Text>
                  <Text style={styles.payoutMeta}>
                    {formatDate(p.arrival_date || p.created)} · {p.status}
                  </Text>
                </View>
              </View>
            ))
          )}
          <TouchableOpacity
            style={styles.stripeLink}
            onPress={() => router.push('/(tabs)/profile/stripe-connect')}
          >
            <Ionicons name="card-outline" size={20} color="#F9A825" />
            <Text style={styles.stripeLinkText}>Stripe account settings</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
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
  headerBack: { width: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 15, color: '#666', textAlign: 'center' },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF9C4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#000', marginBottom: 12, textAlign: 'center' },
  body: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  connectBtn: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  connectBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  balanceCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  balanceLabel: { fontSize: 14, color: '#666', marginBottom: 4 },
  balanceValue: { fontSize: 22, fontWeight: '700', color: '#000' },
  balanceDisclaimer: {
    fontSize: 12,
    color: '#888',
    lineHeight: 17,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#000', marginTop: 20, marginBottom: 12 },
  emptyText: { fontSize: 15, color: '#999', marginBottom: 20 },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  payoutLeft: { flex: 1 },
  payoutAmount: { fontSize: 16, fontWeight: '600', color: '#000' },
  payoutMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  stripeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
  },
  stripeLinkText: { fontSize: 15, color: '#F9A825', fontWeight: '600' },
});
