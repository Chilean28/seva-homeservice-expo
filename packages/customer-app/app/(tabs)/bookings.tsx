import { getInitials } from '@/lib/avatar';
import { useBookingAlerts } from '@/lib/contexts/BookingAlertsContext';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { subscribeToCustomerBookings, unsubscribe } from '@/lib/supabase/realtime';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  isPendingBookingResponseExpired,
  useRefreshOnAppActive,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

// Joined row from Supabase (bookings + services + worker_profiles + users)
type BookingRow = {
  id: string;
  customer_id: string;
  worker_id: string | null;
  service_id: string;
  status: string;
  scheduled_date: string;
  address: string;
  price: number;
  total_amount: number | null;
  estimated_duration_hours: number | null;
  estimated_total: number | null;
  locked_duration_hours: number | null;
  price_locked_at: string | null;
  notes: string | null;
  created_at: string;
  response_deadline_at: string | null;
  services: { name: string } | null;
  worker_profiles: {
    rating_average: number;
    total_jobs_completed: number;
    users: { full_name: string; avatar_url: string | null } | null;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ongoing: 'In-progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired_pending: 'Expired',
};

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

type BookingsTab = 'pending' | 'active' | 'history';

export default function BookingScreen() {
  const { user } = useAuth();
  const { setPendingBookingCount } = useBookingAlerts();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<BookingsTab>('pending');
  const bookingStatusMapRef = useRef<Record<string, string>>({});
  const ratingPromptedBookingIdsRef = useRef<Set<string>>(new Set());

  const promptForRatingIfNeeded = useCallback(
    async (bookingId: string) => {
      if (!user?.id || ratingPromptedBookingIdsRef.current.has(bookingId)) return;
      const { data, error } = await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (error || data) return;
      ratingPromptedBookingIdsRef.current.add(bookingId);
      Alert.alert('Rate your experience', 'Your booking is complete. Please leave a rating.', [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Rate now',
          onPress: () => {
            router.push(`/booking/${bookingId}` as Parameters<typeof router.push>[0]);
          },
        },
      ]);
    },
    [user?.id]
  );

  const fetchBookings = useCallback(async () => {
    if (!user?.id) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: err } = await supabase
      .from('bookings')
      .select(
        `
        id,
        customer_id,
        worker_id,
        service_id,
        status,
        scheduled_date,
        address,
        price,
        total_amount,
        estimated_duration_hours,
        estimated_total,
        locked_duration_hours,
        price_locked_at,
        notes,
        created_at,
        response_deadline_at,
        services (name),
        worker_profiles (
          rating_average,
          total_jobs_completed,
          users (full_name, avatar_url)
        )
      `
      )
      .eq('customer_id', user.id)
      .order('scheduled_date', { ascending: false });

    if (err) {
      setError(err.message);
      setBookings([]);
      bookingStatusMapRef.current = {};
      setPendingBookingCount(0);
    } else {
      const list = (data as BookingRow[]) ?? [];
      setBookings(list);
      bookingStatusMapRef.current = list.reduce<Record<string, string>>((acc, row) => {
        acc[row.id] = row.status;
        return acc;
      }, {});
      setPendingBookingCount(
        list.filter(
          (b) => b.status === 'pending' && !isPendingBookingResponseExpired(b.status, b.response_deadline_at)
        ).length
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [user?.id, setPendingBookingCount]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = subscribeToCustomerBookings(user.id, (payload) => {
      const row = (payload?.new ?? payload?.old ?? null) as { id?: string; status?: string } | null;
      const bookingId = row?.id;
      const incomingStatus = row?.status;
      if (bookingId && incomingStatus) {
        const prevStatus = bookingStatusMapRef.current[bookingId];
        if (prevStatus && prevStatus !== incomingStatus) {
          const statusText = STATUS_LABEL[incomingStatus] ?? incomingStatus.replace(/_/g, ' ');
          Alert.alert('Booking update', `Your booking is now ${statusText}.`);
          if (
            tab === 'pending' &&
            prevStatus === 'pending' &&
            (incomingStatus === 'accepted' || incomingStatus === 'ongoing')
          ) {
            setTab('active');
          }
          if (incomingStatus === 'completed' && prevStatus !== 'completed') {
            void promptForRatingIfNeeded(bookingId);
          }
        }
        bookingStatusMapRef.current[bookingId] = incomingStatus;
      }
      fetchBookings();
    });
    return () => {
      unsubscribe(channel);
    };
  }, [user?.id, fetchBookings, tab, promptForRatingIfNeeded]);

  // Fallback for rare missed realtime events: refresh while this screen is open.
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      fetchBookings();
    }, 6000);
    return () => clearInterval(interval);
  }, [user?.id, fetchBookings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookings();
  }, [fetchBookings]);

  useRefreshOnAppActive(fetchBookings);

  const providerName = (row: BookingRow) =>
    row.worker_profiles?.users?.full_name ?? 'Worker TBD';
  const serviceName = (row: BookingRow) => row.services?.name ?? 'Service';
  const rating = (row: BookingRow) => row.worker_profiles?.rating_average ?? 0;
  const statusLabel = (row: BookingRow) => {
    if (isPendingBookingResponseExpired(row.status, row.response_deadline_at)) {
      return STATUS_LABEL.expired_pending;
    }
    return STATUS_LABEL[row.status] ?? row.status;
  };

  const isHistoryRow = (row: BookingRow) =>
    row.status === 'completed' ||
    row.status === 'cancelled' ||
    isPendingBookingResponseExpired(row.status, row.response_deadline_at);
  const pendingBookings = bookings.filter(
    (r) => r.status === 'pending' && !isPendingBookingResponseExpired(r.status, r.response_deadline_at)
  );
  const activeBookings = bookings.filter((r) => r.status === 'accepted' || r.status === 'ongoing');
  const historyBookings = bookings.filter((r) => isHistoryRow(r));
  const displayList = tab === 'pending' ? pendingBookings : tab === 'active' ? activeBookings : historyBookings;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Booking</Text>
            </View>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>
      <View style={styles.tabs}>
        {(['pending', 'active', 'history'] as BookingsTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#000"
          />
        }
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#000" />
            <Text style={styles.loadingText}>Loading bookings…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="warning-outline" size={48} color="#999" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : displayList.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons
              name={tab === 'history' ? 'document-text-outline' : tab === 'active' ? 'briefcase-outline' : 'time-outline'}
              size={56}
              color="#CCC"
            />
            <Text style={styles.emptyTitle}>
              {tab === 'history' ? 'No history yet' : tab === 'active' ? 'No active bookings' : 'No pending bookings'}
            </Text>
            <Text style={styles.emptySubtext}>
              {tab === 'history'
                ? 'Completed, cancelled, and expired requests appear here.'
                : tab === 'active'
                  ? 'Accepted and in-progress bookings appear here.'
                  : 'Pending booking requests waiting for worker response appear here.'}
            </Text>
          </View>
        ) : (
          displayList.map((row) => (
            <TouchableOpacity
              key={row.id}
              activeOpacity={0.8}
              onPress={() => router.push(`/booking/${row.id}` as Parameters<typeof router.push>[0])}
              style={styles.cardWrap}
            >
              <View style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardLeft}>
                    {row.worker_profiles?.users?.avatar_url ? (
                      <Image source={{ uri: row.worker_profiles.users.avatar_url }} style={styles.avatarPlaceholder} />
                    ) : (
                      <View style={[styles.avatarPlaceholder, styles.avatarFallback]}>
                        <Text style={styles.avatarInitials}>{getInitials(providerName(row))}</Text>
                      </View>
                    )}
                    <View style={styles.cardInfo}>
                      <Text style={styles.providerName}>
                        {providerName(row)}
                      </Text>
                      <Text style={styles.serviceType}>{serviceName(row)}</Text>
                      {row.worker_profiles && (
                        <View style={styles.ratingRow}>
                          <Ionicons
                            name="star"
                            size={14}
                            color="#34C759"
                          />
                          <Text style={styles.ratingText}>
                            {Number(rating(row)).toFixed(1)} (
                            {row.worker_profiles.total_jobs_completed} jobs)
                          </Text>
                        </View>
                      )}
                      <Text style={styles.dateTime}>
                        {formatDateTime(row.scheduled_date)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <View
                      style={[
                        styles.statusBadge,
                        isPendingBookingResponseExpired(row.status, row.response_deadline_at) &&
                          styles.statusBadgeExpired,
                      ]}
                    >
                      <Ionicons
                        name={
                          isPendingBookingResponseExpired(row.status, row.response_deadline_at)
                            ? 'alert-circle-outline'
                            : 'time-outline'
                        }
                        size={12}
                        color="#000"
                      />
                      <Text style={styles.statusBadgeText}>{statusLabel(row)}</Text>
                    </View>
                    <View style={styles.priceBlock}>
                      {row.total_amount != null ? (
                        <>
                          <Text style={styles.totalAmountBig}>${Number(row.total_amount).toFixed(2)}</Text>
                          <Text style={styles.pricePerHour}>${Number(row.price).toFixed(2)}/hr</Text>
                          {row.price_locked_at ? (
                            <Text style={styles.priceLockedTag}>Final price</Text>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Text style={styles.price}>${Number(row.price).toFixed(2)}</Text>
                          <Text style={styles.priceUnit}>/hr</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  headerSide: { width: 24 },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  tabActive: {
    backgroundColor: '#FFEB3B',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#000',
  },
  content: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: '#FF3B30',
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  cardWrap: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#F9A825',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  statusBadgeExpired: {
    backgroundColor: '#ECEFF1',
    borderColor: '#B0BEC5',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginLeft: 4,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8E8E8',
    overflow: 'hidden',
    marginRight: 12,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 18, fontWeight: '600', color: '#666' },
  cardInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  serviceType: {
    fontSize: 14,
    color: '#000',
    marginBottom: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#000',
    marginLeft: 4,
  },
  dateTime: {
    fontSize: 13,
    color: '#666',
  },
  cardRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  priceBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  totalAmountBig: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  pricePerHour: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  priceLockedTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  priceUnit: {
    fontSize: 12,
    color: '#999',
    marginLeft: 2,
  },
});
