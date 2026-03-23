import { getInitials } from '@/lib/avatar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  isJobChatOpen,
  isPendingBookingResponseExpired,
} from '@seva/shared';
import { BookingStatus } from '@/lib/types/enums';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

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
  locked_hourly_rate: number | null;
  price_locked_at: string | null;
  price_confirmed_by_customer_at: string | null;
  price_lock_note: string | null;
  notes: string | null;
  created_at: string;
  response_deadline_at: string | null;
  payment_method?: 'card' | 'cash' | null;
  payment_status?: 'unpaid' | 'pending' | 'paid' | 'refunded' | null;
  cash_platform_fee_status?: 'pending' | 'charged' | 'failed' | null;
  cash_platform_fee_cents?: number | null;
  services: { name: string } | null;
  worker_profiles: {
    rating_average: number;
    total_jobs_completed: number;
    users: { full_name: string; avatar_url: string | null } | null;
  } | null;
};

/** Human-readable payment row for booking detail (Stripe + optional Connect). */
function getPaymentCopy(
  paymentMethod: BookingRow['payment_method'],
  paymentStatus: BookingRow['payment_status'],
  cashFeeStatus: BookingRow['cash_platform_fee_status'],
  cashFeeCents: BookingRow['cash_platform_fee_cents']
): { headline: string; detail: string } {
  const pm = paymentMethod ?? undefined;
  const ps = paymentStatus ?? undefined;

  if (pm === 'cash') {
    const feeLine =
      cashFeeStatus === 'charged' && cashFeeCents != null
        ? ` The platform fee (${(cashFeeCents / 100).toFixed(2)}) was debited from your worker’s Stripe Connect balance.`
        : cashFeeStatus === 'pending'
          ? ' Your worker’s platform fee is pending (Stripe Connect balance or onboarding).'
          : cashFeeStatus === 'failed'
            ? ' Collection of the worker’s platform fee may have failed—they can check Stripe Connect in the worker app.'
            : '';
    return {
      headline: 'Cash',
      detail: `Pay your worker directly for the service.${feeLine}`,
    };
  }

  if (pm === 'card' || (pm !== 'cash' && (ps === 'pending' || ps === 'paid' || ps === 'refunded'))) {
    const statusLabel =
      ps === 'paid'
        ? 'Paid (Stripe)'
        : ps === 'pending'
          ? 'Pending authorization (Stripe)'
          : ps === 'refunded'
            ? 'Refunded (check Stripe for details)'
            : 'Card on file';
    return {
      headline: statusLabel,
      detail:
        ps === 'paid'
          ? 'Charged via Stripe. When your worker uses Stripe Connect, platform fee and payout timing are handled in Stripe—not in this screen’s totals alone.'
          : ps === 'pending'
            ? 'Card payment is processing or authorized in Stripe; status will update when complete.'
            : ps === 'refunded'
              ? 'Refund handling may still be completed in Stripe Dashboard; app sync is a future milestone.'
              : 'Card payment was set up for this booking.',
    };
  }

  return {
    headline: 'Payment',
    detail: 'See your booking confirmation flow for how this job was paid.',
  };
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ongoing: 'In-progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
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

type ExistingReview = { id: string; rating: number; comment: string | null };

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [ratingStep, setRatingStep] = useState<'stars' | 'comment'>('stars');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [confirmingPrice, setConfirmingPrice] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [expiredModalDismissed, setExpiredModalDismissed] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!user?.id || !id) {
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
        locked_hourly_rate,
        price_locked_at,
        price_confirmed_by_customer_at,
        price_lock_note,
        notes,
        created_at,
        response_deadline_at,
        payment_method,
        payment_status,
        cash_platform_fee_status,
        cash_platform_fee_cents,
        services (name),
        worker_profiles (
          rating_average,
          total_jobs_completed,
          users (full_name, avatar_url)
        )
      `
      )
      .eq('id', id)
      .eq('customer_id', user.id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setBooking(null);
    } else {
      const b = (data ?? null) as unknown as BookingRow | null;
      setBooking(b);
      const completed =
        b != null && String(b.status).toLowerCase() === BookingStatus.COMPLETED;
      if (completed && b?.id) {
        const { data: reviewData } = await supabase
          .from('reviews')
          .select('id, rating, comment')
          .eq('booking_id', b.id)
          .maybeSingle();
        setExistingReview((reviewData as ExistingReview | null) ?? null);
        if (!reviewData && b.worker_id) {
          setShowRatingModal(true);
          setRatingStep('stars');
          setSelectedRating(0);
          setReviewComment('');
        } else {
          setShowRatingModal(false);
        }
      } else {
        setExistingReview(null);
        setShowRatingModal(false);
      }
    }
    setLoading(false);
  }, [user?.id, id]);

  useEffect(() => {
    setExpiredModalDismissed(false);
    setShowExpiredModal(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id && id) {
        void fetchBooking();
      }
    }, [user?.id, id, fetchBooking])
  );

  useEffect(() => {
    if (!user?.id || !id) return;
    let ch: RealtimeChannel | null = null;
    ch = supabase
      .channel(`booking-detail-row:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${id}`,
        },
        () => {
          void fetchBooking();
        }
      )
      .subscribe();
    return () => {
      if (ch) void supabase.removeChannel(ch);
    };
  }, [user?.id, id, fetchBooking]);

  useEffect(() => {
    if (
      !loading &&
      booking &&
      isPendingBookingResponseExpired(booking.status, booking.response_deadline_at) &&
      !expiredModalDismissed
    ) {
      setShowExpiredModal(true);
    }
  }, [loading, booking, expiredModalDismissed]);

  const submitReview = useCallback(async (skipComment: boolean) => {
    if (!booking?.worker_id || !user?.id || selectedRating < 1 || selectedRating > 5) return;
    setSubmittingReview(true);
    try {
      const { error: insertErr } = await supabase.from('reviews').insert({
        booking_id: booking.id,
        customer_id: user.id,
        worker_id: booking.worker_id,
        rating: selectedRating,
        comment: skipComment ? null : (reviewComment.trim() || null),
      } as never);
      if (insertErr) throw insertErr;
      // rating_average is updated by DB trigger sync_worker_rating_on_review (see database/trigger-worker-rating.sql)
      setExistingReview({ id: '', rating: selectedRating, comment: reviewComment.trim() || null });
      setShowRatingModal(false);
      fetchBooking();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit rating.');
    } finally {
      setSubmittingReview(false);
    }
  }, [booking?.id, booking?.worker_id, user?.id, selectedRating, reviewComment, fetchBooking]);

  const dismissExpiredModal = useCallback(() => {
    setShowExpiredModal(false);
    setExpiredModalDismissed(true);
  }, []);

  const canCancel = booking
    ? booking.status === 'pending' || booking.status === 'accepted'
    : false;
  const needsConfirmFinalPrice =
    !!booking &&
    booking.status === BookingStatus.ACCEPTED &&
    !!booking.price_locked_at &&
    !booking.price_confirmed_by_customer_at;

  const confirmFinalPrice = useCallback(() => {
    if (!booking || !user?.id) return;
    const total = Number(booking.total_amount ?? 0).toFixed(2);
    const hrs = Number(booking.locked_duration_hours ?? 0);
    const lockRate = Number(booking.locked_hourly_rate ?? booking.price).toFixed(2);
    const note = booking.price_lock_note?.trim();
    const noteLine = note ? `\n\nFrom your worker: ${note}` : '';
    Alert.alert(
      'Confirm final price',
      `Total $${total} (${hrs}h at $${lockRate}/hr).${noteLine}\n\nAfter you confirm, your worker can start the job.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirmingPrice(true);
            const { error } = await supabase
              .from('bookings')
              .update({ price_confirmed_by_customer_at: new Date().toISOString() } as never)
              .eq('id', booking.id)
              .eq('customer_id', user.id)
              .not('price_locked_at', 'is', null);
            setConfirmingPrice(false);
            if (error) Alert.alert('Error', error.message);
            else fetchBooking();
          },
        },
      ]
    );
  }, [booking, user?.id, fetchBooking]);

  const cancelBooking = useCallback(() => {
    if (!booking || !canCancel || !user?.id) return;
    Alert.alert(
      'Cancel booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            await invokeEdgeFunction('cancel-booking-payment', { booking_id: booking.id });
            const { error: err } = await supabase
              .from('bookings')
              .update({ status: BookingStatus.CANCELLED } as never)
              .eq('id', booking.id)
              .eq('customer_id', user.id);
            if (err) Alert.alert('Error', err.message);
            else router.back();
          },
        },
      ]
    );
  }, [booking, canCancel, user?.id, router]);

  const openChat = useCallback(async () => {
    if (!booking?.worker_id || !user?.id) return;
    // Prefer existing conversation for this booking, then any existing conversation with this worker (reuse one chat per worker)
    const { data: byBooking } = await supabase
      .from('conversations')
      .select('id')
      .eq('booking_id', booking.id)
      .maybeSingle();
    let convId = (byBooking as { id?: string } | null)?.id;
    if (!convId) {
      const { data: existingList } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_id', user.id)
        .eq('worker_id', booking.worker_id)
        .order('updated_at', { ascending: false })
        .limit(1);
      const existing = Array.isArray(existingList) ? existingList[0] : existingList;
      convId = (existing as { id?: string } | null)?.id;
      if (convId) {
        await supabase
          .from('conversations')
          .update({ booking_id: booking.id } as never)
          .eq('id', convId);
      }
    }
    if (!convId) {
      const { data: inserted } = await supabase
        .from('conversations')
        .insert({
          customer_id: user.id,
          worker_id: booking.worker_id,
          booking_id: booking.id,
        } as never)
        .select('id')
        .single();
      convId = (inserted as { id?: string } | null)?.id;
    }
    if (convId) router.push(`/conversation/${convId}`);
  }, [booking, user?.id, router]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (error || !booking) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color="#999" />
          <Text style={styles.errorText}>{error ?? 'Booking not found'}</Text>
        </View>
      </View>
    );
  }

  const paymentCopy = getPaymentCopy(
    booking.payment_method,
    booking.payment_status,
    booking.cash_platform_fee_status,
    booking.cash_platform_fee_cents
  );

  const providerName =
    booking.worker_profiles?.users?.full_name ?? 'Worker TBD';
  const serviceName = booking.services?.name ?? 'Service';
  const rating = booking.worker_profiles?.rating_average ?? 0;
  const responseExpired = isPendingBookingResponseExpired(
    booking.status,
    booking.response_deadline_at
  );
  const statusLabel = responseExpired
    ? 'Expired'
    : STATUS_LABEL[booking.status] ?? booking.status;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={[styles.statusBadge, responseExpired && styles.statusBadgeExpired]}>
            <Ionicons
              name={responseExpired ? 'alert-circle-outline' : 'time-outline'}
              size={12}
              color="#000"
            />
            <Text style={styles.statusBadgeText}>{statusLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            {booking.worker_profiles?.users?.avatar_url ? (
              <Image source={{ uri: booking.worker_profiles.users.avatar_url }} style={styles.avatarPlaceholder} />
            ) : (
              <View style={[styles.avatarPlaceholder, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{getInitials(providerName)}</Text>
              </View>
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.providerName}>{providerName}</Text>
              <Text style={styles.serviceType}>{serviceName}</Text>
              {booking.worker_profiles && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#34C759" />
                  <Text style={styles.ratingText}>
                    {Number(rating).toFixed(1)} (
                    {booking.worker_profiles.total_jobs_completed} jobs)
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date & time</Text>
            <Text style={styles.fieldValue}>
              {formatDateTime(booking.scheduled_date)}
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Address</Text>
            <Text style={styles.fieldValue}>{booking.address}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Price</Text>
            <View>
              <Text style={styles.fieldValuePerHour}>Booked rate: ${Number(booking.price).toFixed(2)}/hr</Text>
              {booking.estimated_total != null && (
                <Text style={styles.fieldValueMuted}>
                  Initial estimate ({Number(booking.estimated_duration_hours ?? 2)}h min): $
                  {Number(booking.estimated_total).toFixed(2)}
                </Text>
              )}
              {booking.total_amount != null && (
                <Text style={styles.fieldValueTotal}>
                  {booking.price_locked_at ? 'Final total' : 'Current total'}: $
                  {Number(booking.total_amount).toFixed(2)}
                </Text>
              )}
              {booking.price_locked_at && booking.locked_duration_hours != null ? (
                <>
                  <Text style={styles.priceLockedNote}>
                    Locked: {Number(booking.locked_duration_hours)}h @ $
                    {Number(booking.locked_hourly_rate ?? booking.price).toFixed(2)}
                    /hr ·{' '}
                    {new Date(booking.price_locked_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                  {booking.price_lock_note ? (
                    <Text style={styles.priceLockNoteFromWorker}>{booking.price_lock_note}</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.fieldValueMuted}>
                  Your worker may adjust hours or rate after reviewing the job; you’ll confirm the final total
                  before they start.
                </Text>
              )}
              {booking.price_confirmed_by_customer_at ? (
                <Text style={styles.priceConfirmedNote}>
                  You confirmed this total on{' '}
                  {new Date(booking.price_confirmed_by_customer_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  .
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Payment</Text>
            <View>
              <Text style={styles.fieldValue}>{paymentCopy.headline}</Text>
              <Text style={styles.paymentDetailText}>{paymentCopy.detail}</Text>
            </View>
          </View>
          {booking.notes ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Notes</Text>
              <Text style={styles.fieldValue}>{booking.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          {needsConfirmFinalPrice && (
            <TouchableOpacity
              style={styles.confirmPriceButton}
              onPress={confirmFinalPrice}
              disabled={confirmingPrice}
              activeOpacity={0.8}
            >
              {confirmingPrice ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#000" />
                  <Text style={styles.confirmPriceButtonText}>Confirm final price</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {booking.worker_id &&
            (isJobChatOpen(booking.scheduled_date) ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={openChat}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubble-outline" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Message</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.chatClosedNotice}>
                <Ionicons name="lock-closed-outline" size={20} color="#666" />
                <Text style={styles.chatClosedNoticeText}>
                  Messaging closed — chat ends 48 hours after the scheduled job.
                </Text>
              </View>
            ))}
          {canCancel && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelBooking}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Cancel booking</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showExpiredModal}
        transparent
        animationType="fade"
        onRequestClose={dismissExpiredModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="alert-circle-outline" size={48} color="#78909C" />
            </View>
            <Text style={styles.modalTitle}>Request expired</Text>
            <Text style={styles.modalSubtitle}>
              No worker accepted this booking before the response window ended. You can cancel this request
              from the actions below or book a new service anytime.
            </Text>
            <TouchableOpacity style={styles.modalPrimaryBtn} onPress={dismissExpiredModal} activeOpacity={0.8}>
              <Text style={styles.modalPrimaryBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRatingModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {ratingStep === 'stars' ? (
              <>
                <Text style={styles.modalTitle}>Rate your experience</Text>
                <Text style={styles.modalSubtitle}>How was the service?</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setSelectedRating(star)}
                      style={styles.starBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={selectedRating >= star ? 'star' : 'star-outline'}
                        size={40}
                        color={selectedRating >= star ? '#FFD54F' : '#CCC'}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, selectedRating < 1 && styles.modalPrimaryBtnDisabled]}
                  onPress={() => setRatingStep('comment')}
                  disabled={selectedRating < 1}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalPrimaryBtnText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Add a comment (optional)</Text>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Share your experience..."
                  placeholderTextColor="#999"
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalSkipBtn}
                    onPress={() => submitReview(true)}
                    disabled={submittingReview}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalSkipBtnText}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPrimaryBtn}
                    onPress={() => submitReview(false)}
                    disabled={submittingReview}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalPrimaryBtnText}>
                      {submittingReview ? 'Submitting…' : 'Submit'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  headerSide: {
    width: 32,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 32,
  },
  modalIconWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  centered: {
    flex: 1,
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 16,
    marginBottom: 24,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#F9A825',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 16,
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
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8E8E8',
    marginRight: 12,
    overflow: 'hidden',
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
  },
  ratingText: {
    fontSize: 13,
    color: '#000',
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE',
    marginVertical: 16,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 15,
    color: '#000',
  },
  fieldValueTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 6,
    marginBottom: 2,
  },
  fieldValueMuted: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  paymentDetailText: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    lineHeight: 18,
  },
  priceLockedNote: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 6,
  },
  priceLockNoteFromWorker: {
    fontSize: 13,
    color: '#444',
    marginTop: 8,
    lineHeight: 18,
  },
  priceConfirmedNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
  confirmPriceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEB3B',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#F9A825',
    minHeight: 48,
  },
  confirmPriceButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  fieldValuePerHour: {
    fontSize: 14,
    color: '#666',
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  chatClosedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chatClosedNoticeText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  starBtn: {
    padding: 4,
  },
  modalPrimaryBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalPrimaryBtnDisabled: {
    opacity: 0.5,
  },
  modalPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#000',
    minHeight: 80,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalSkipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  modalSkipBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});
