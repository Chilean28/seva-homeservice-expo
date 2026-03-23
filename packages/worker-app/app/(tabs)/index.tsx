import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useStripeConnectBalances } from '@/lib/hooks/useStripeConnectBalances';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BookingStatus } from '@/lib/types/enums';
import type { Booking } from '@/lib/types/database';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  useRefreshOnAppActive,
} from '@seva/shared';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTodayScheduleDate, hasAvailabilityWindows } from '@/lib/workerAvailability';

type BookingWithService = Booking & { services?: { name: string } | null };

export default function DashboardScreen() {
  const { user } = useAuth();
  const { profile, workerId, loading: profileLoading, refetch: refetchProfile, setAvailability } = useWorkerProfile(user?.id);
  const [recentBookings, setRecentBookings] = useState<BookingWithService[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { balances, loading: stripeLoading, refetch: refetchStripe } = useStripeConnectBalances();
  const todayStr = useMemo(() => getTodayScheduleDate(), []);
  const [availabilityGateLoading, setAvailabilityGateLoading] = useState(true);
  const [hasAvailabilitySlots, setHasAvailabilitySlots] = useState(false);

  const selectRecent = 'id, status, scheduled_date, price, total_amount, address, created_at, services(name)';

  const fetchBookings = useCallback(async () => {
    if (!workerId) {
      setLoadingBookings(false);
      setRecentBookings([]);
      return;
    }
    setLoadingBookings(true);
    const [pendingRes, activeRes, completedRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(selectRecent)
        .eq('worker_id', workerId)
        .eq('status', BookingStatus.PENDING)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('bookings')
        .select(selectRecent)
        .eq('worker_id', workerId)
        .in('status', [BookingStatus.ACCEPTED, BookingStatus.ONGOING])
        .order('scheduled_date', { ascending: true })
        .limit(5),
      supabase
        .from('bookings')
        .select(selectRecent)
        .eq('worker_id', workerId)
        .in('status', [BookingStatus.COMPLETED, BookingStatus.CANCELLED])
        .order('scheduled_date', { ascending: false })
        .limit(5),
    ]);

    setLoadingBookings(false);
    const p = (pendingRes.data as BookingWithService[]) ?? [];
    const a = (activeRes.data as BookingWithService[]) ?? [];
    const c = (completedRes.data as BookingWithService[]) ?? [];
    setRecentBookings([...p, ...a, ...c].slice(0, 10));
  }, [workerId]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useFocusEffect(
    useCallback(() => {
      refetchProfile();
      fetchBookings();
    }, [refetchProfile, fetchBookings])
  );

  const loadAvailabilityGate = useCallback(async () => {
    if (!workerId) {
      setHasAvailabilitySlots(false);
      setAvailabilityGateLoading(false);
      return;
    }
    setAvailabilityGateLoading(true);
    const ok = await hasAvailabilityWindows(workerId, todayStr);
    setHasAvailabilitySlots(ok);
    setAvailabilityGateLoading(false);
  }, [workerId, todayStr]);

  useFocusEffect(
    useCallback(() => {
      loadAvailabilityGate();
    }, [loadAvailabilityGate])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), fetchBookings(), refetchStripe(), loadAvailabilityGate()]);
    setRefreshing(false);
  }, [refetchProfile, fetchBookings, refetchStripe, loadAvailabilityGate]);

  useRefreshOnAppActive(onRefresh);

  const displayName = user?.user_metadata?.full_name ?? user?.email ?? 'Worker';
  const hasProfile = !!profile;

  if (profileLoading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrapper}>
          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <Text style={styles.headerTitle}>Dashboard</Text>
          </SafeAreaView>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <Text style={styles.greeting}>Hello, {displayName.split(' ')[0]}</Text>
          <Text style={styles.subtitle}>Worker Dashboard</Text>
        </SafeAreaView>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >

        {!hasProfile && (
          <TouchableOpacity
            style={styles.completeProfileBanner}
            onPress={() => router.push({ pathname: '/(tabs)/profile/setup', params: { from: 'dashboard' } })}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={24} color="#000" />
            <Text style={styles.completeProfileText}>Complete your profile to start receiving jobs</Text>
          </TouchableOpacity>
        )}

        {hasProfile && (
          <>
            <View style={styles.availabilityCard}>
              <View style={styles.availabilityLeft}>
                <Text style={styles.availabilityLabel}>Available for jobs</Text>
                {availabilityGateLoading ? (
                  <Text style={styles.availabilityHint}>Checking availability...</Text>
                ) : hasAvailabilitySlots ? null : (
                  <Text style={styles.availabilityHint}>Add at least one availability slot to enable.</Text>
                )}
              </View>
              <Switch
                value={profile.is_available}
                onValueChange={setAvailability}
                disabled={availabilityGateLoading || !hasAvailabilitySlots}
                trackColor={{ false: '#e5e5e5', true: '#FFEB3B' }}
                thumbColor="#000"
              />
            </View>

            <TouchableOpacity
              style={styles.balanceCard}
              onPress={() => router.push('/payouts')}
              activeOpacity={0.85}
            >
              <Text style={styles.balanceCardTitle}>Balance</Text>
              {stripeLoading && !balances ? (
                <ActivityIndicator size="small" color="#000" style={{ marginVertical: 8 }} />
              ) : balances?.noAccount ? (
                <Text style={styles.balanceHint}>Connect your account in Profile to receive payouts</Text>
              ) : balances?.error ? (
                <Text style={styles.balanceHint}>{balances.error}</Text>
              ) : (
                <>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Available</Text>
                    <Text style={styles.balanceValue}>
                      ${((balances?.available_cents ?? 0) / 100).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Pending</Text>
                    <Text style={styles.balanceValueMuted}>
                      ${((balances?.pending_cents ?? 0) / 100).toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.balanceDisclaimer}>
                    Stripe Connect balance. Job totals in the app are gross; platform fee and bank timing are in
                    Stripe.
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.setRatesBtn}
              onPress={() => router.push('/(tabs)/profile/set-rates')}
              activeOpacity={0.85}
            >
              <Ionicons name="pricetag-outline" size={20} color="#666" />
              <Text style={styles.setRatesText}>Set rates</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="briefcase" size={28} color="#000" />
                <Text style={styles.statValue}>{profile.total_jobs_completed}</Text>
                <Text style={styles.statLabel}>Jobs done</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="star" size={28} color="#000" />
                <Text style={styles.statValue}>{Number(profile.rating_average).toFixed(1)}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent jobs</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/jobs')}>
                  <Text style={styles.seeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              {loadingBookings ? (
                <ActivityIndicator size="small" color="#000" style={styles.loader} />
              ) : recentBookings.length === 0 ? (
                <Text style={styles.emptyText}>No jobs yet</Text>
              ) : (
                recentBookings.slice(0, 8).map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.bookingRow}
                    onPress={() => {
                      let tab: 'pending' | 'active' | 'history' = 'active';
                      if (
                        b.status === BookingStatus.COMPLETED ||
                        b.status === BookingStatus.CANCELLED
                      ) {
                        tab = 'history';
                      } else if (b.status === BookingStatus.PENDING) {
                        tab = 'pending';
                      }
                      router.push({ pathname: '/(tabs)/jobs', params: { tab, highlight: b.id } });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.bookingInfo}>
                      <Text style={styles.bookingService}>{b.services?.name ?? 'Service'}</Text>
                      <Text style={styles.bookingMeta}>
                        {new Date(b.scheduled_date).toLocaleDateString()} ·{' '}
                        {b.total_amount != null
                          ? `$${Number(b.total_amount).toFixed(2)} total`
                          : `$${Number(b.price).toFixed(0)}/hr`}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, statusColor(b.status)]}>
                      <Text style={styles.statusText}>{b.status}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function statusColor(status: string): { backgroundColor: string } {
  switch (status) {
    case BookingStatus.PENDING:
      return { backgroundColor: '#FFE082' };
    case BookingStatus.ACCEPTED:
      return { backgroundColor: '#81C784' };
    case BookingStatus.ONGOING:
      return { backgroundColor: '#64B5F6' };
    case BookingStatus.COMPLETED:
      return { backgroundColor: '#A5D6A7' };
    case BookingStatus.CANCELLED:
      return { backgroundColor: '#EF9A9A' };
    default:
      return { backgroundColor: '#E0E0E0' };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  headerWrapper: {
    backgroundColor: APP_SCREEN_HEADER_BG,
  },
  headerSafe: {
    backgroundColor: APP_SCREEN_HEADER_BG,
    ...appScreenHeaderBarPadding,
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  greeting: {
    ...appScreenHeaderTitleStyle,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  completeProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFEB3B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  completeProfileText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  availabilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  availabilityLeft: { flex: 1, paddingRight: 12 },
  availabilityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  availabilityHint: { fontSize: 13, fontWeight: '600', color: '#666', marginTop: 2 },
  balanceCard: {
    backgroundColor: '#FFFDE7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFEB3B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  balanceCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  balanceLabel: { fontSize: 15, color: '#333' },
  balanceValue: { fontSize: 18, fontWeight: '700', color: '#000' },
  balanceValueMuted: { fontSize: 16, fontWeight: '600', color: '#666' },
  balanceHint: { fontSize: 14, color: '#666' },
  balanceDisclaimer: {
    fontSize: 11,
    color: '#888',
    lineHeight: 15,
    marginTop: 8,
  },
  setRatesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  setRatesText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#666' },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  seeAll: {
    fontSize: 14,
    color: '#F9A825',
    fontWeight: '600',
  },
  loader: {
    marginVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    paddingVertical: 16,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingService: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  bookingMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    textTransform: 'capitalize',
  },
});
