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
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

type BookingsTab = 'upcoming' | 'history';

export default function BookingScreen() {
  const { user } = useAuth();
  const { setPendingBookingCount } = useBookingAlerts();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<BookingsTab>('upcoming');

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
      setPendingBookingCount(0);
    } else {
      const list = (data as BookingRow[]) ?? [];
      setBookings(list);
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
    const channel = subscribeToCustomerBookings(user.id, () => {
      fetchBookings();
    });
    return () => {
      unsubscribe(channel);
    };
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
  const upcomingBookings = bookings.filter((r) => !isHistoryRow(r));
  const historyBookings = bookings.filter((r) => isHistoryRow(r));
  const displayList = tab === 'upcoming' ? upcomingBookings : historyBookings;
  const showingHistory = tab === 'history';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={[styles.headerSide, styles.headerSideLeft]}>
              {showingHistory ? (
                <TouchableOpacity
                  onPress={() => setTab('upcoming')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="arrow-back" size={24} color="#000" />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>{showingHistory ? 'History' : 'Booking'}</Text>
            </View>
            <View style={[styles.headerSide, styles.headerSideRight]}>
              {!showingHistory ? (
                <TouchableOpacity
                  onPress={() => setTab('history')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="time-outline" size={24} color="#000" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
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
            <Ionicons name={tab === 'history' ? 'document-text-outline' : 'calendar-outline'} size={56} color="#CCC" />
            <Text style={styles.emptyTitle}>
              {tab === 'history' ? 'No history yet' : 'No bookings yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {tab === 'history'
                ? 'Completed, cancelled, and expired requests appear here.'
                : 'Your bookings will appear here when you book a service.'}
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
    backgroundColor: '#fff',
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
  headerSide: {
    width: 40,
    minHeight: 24,
  },
  headerSideLeft: {
    alignItems: 'flex-start',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
    borderWidth: 1.5,
    borderColor: '#000',
    backgroundColor: '#fff',
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
