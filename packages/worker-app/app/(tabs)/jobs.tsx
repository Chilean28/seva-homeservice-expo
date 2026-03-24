import { JobDetailPanel } from '@/components/JobDetailPanel';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { usePendingJobs } from '@/lib/contexts/PendingJobsContext';
import { supabase } from '@/lib/supabase/client';
import { subscribeToWorkerBookingUpdates, subscribeToWorkerJobs, unsubscribe } from '@/lib/supabase/realtime';
import { BookingStatus } from '@/lib/types/enums';
import type { JobRow } from '@/lib/types/jobRow';
import {
  APP_SCREEN_HEADER_BG,
  appScreenHeaderBarPadding,
  appScreenHeaderTitleStyle,
  isJobChatOpen,
  useRefreshOnAppActive,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function isJobExpired(job: JobRow): boolean {
  if (!job.response_deadline_at) return false;
  return new Date(job.response_deadline_at).getTime() <= Date.now();
}

function getMinutesLeft(job: JobRow): number | null {
  if (!job.response_deadline_at) return null;
  const deadline = new Date(job.response_deadline_at).getTime();
  const now = Date.now();
  if (deadline <= now) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 60000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** RN/Supabase often surfaces flaky Wi‑Fi as this message; safe to retry a few times. */
function isRetriableJobsFetchError(message: string): boolean {
  return /network request failed|aborted|timeout|fetch failed|ECONNRESET|ENOTFOUND|socket|timed out/i.test(
    message
  );
}

type FetchJobsOnceResult = 'ok' | 'fail_retry' | 'fail_done';

/** Matches customer booking detail alerts (human-readable status). */
const BOOKING_STATUS_ALERT_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  ongoing: 'In-progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatJobsLoadErrorForDisplay(message: string): string {
  if (/typeerror|network request failed|fetch failed|aborted|timeout/i.test(message)) {
    return 'Could not reach the server. Check your connection and tap Retry.';
  }
  return message;
}

/** Worker locked final price; customer must confirm in app before worker can start. */
function needsCustomerPriceConfirm(job: JobRow): boolean {
  return (
    !!job.price_locked_at &&
    !job.price_confirmed_by_customer_at &&
    job.status === BookingStatus.ACCEPTED
  );
}

type TabKey = 'pending' | 'active' | 'history';

const BOOKINGS_JOB_LIST_SELECT = `
    id, customer_id, worker_id, service_id, status, scheduled_date, address, price, total_amount,
    estimated_duration_hours, estimated_total, locked_duration_hours, locked_hourly_rate, price_locked_at,
    price_confirmed_by_customer_at, price_lock_note,
    notes, created_at, completed_at, response_deadline_at, payment_method, payment_status,
    booking_refund_requests (id, status, reason, requested_at, error_message),
    services (name),
    users (full_name)
  `;

export default function JobsScreen() {
  const { user } = useAuth();
  const { tab: tabParam, highlight: highlightParam } = useLocalSearchParams<{ tab?: string; highlight?: string }>();
  const { setPendingJobsCount } = usePendingJobs();
  const { profile, workerId, loading: profileLoading, refetch: refetchProfile } = useWorkerProfile(user?.id);
  const [tab, setTab] = useState<TabKey>('pending');
  const [pending, setPending] = useState<JobRow[]>([]);
  const [active, setActive] = useState<JobRow[]>([]);
  const [history, setHistory] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<JobRow | null>(null);
  /** Prevents re-opening the detail modal on every jobs refetch when URL still has ?highlight= */
  const highlightConsumedRef = useRef<string | null>(null);
  const fetchJobsMutexRef = useRef(false);
  const fetchJobsQueuedRef = useRef(false);
  const fetchJobsRef = useRef<() => Promise<void>>(async () => {});

  const runFetchJobsOnce = useCallback(async (): Promise<FetchJobsOnceResult> => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      setJobsError(null);
      return 'ok';
    }
    setJobsError(null);

    // Pending: unassigned (worker_id null) OR pre-assigned to this worker
    const pendingUnassignedRes = await supabase
      .from('bookings')
      .select(BOOKINGS_JOB_LIST_SELECT)
      .eq('status', BookingStatus.PENDING)
      .is('worker_id', null)
      .order('created_at', { ascending: false });
    const unassigned = (pendingUnassignedRes.data as JobRow[]) ?? [];
    if (pendingUnassignedRes.error) {
      const msg = pendingUnassignedRes.error.message;
      setJobsError(msg);
      setPending([]);
      setActive([]);
      setHistory([]);
      setLoading(false);
      setRefreshing(false);
      return isRetriableJobsFetchError(msg) ? 'fail_retry' : 'fail_done';
    }

    if (!workerId) {
      const filtered = unassigned.filter((j) => !isJobExpired(j));
      setPending(filtered);
      setPendingJobsCount(filtered.length);
      setActive([]);
      setHistory([]);
      setLoading(false);
      setRefreshing(false);
      return 'ok';
    }

    const pendingAssignedToMeRes = await supabase
      .from('bookings')
      .select(BOOKINGS_JOB_LIST_SELECT)
      .eq('status', BookingStatus.PENDING)
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false });
    const assignedToMe = (pendingAssignedToMeRes.data as JobRow[]) ?? [];
    if (pendingAssignedToMeRes.error) {
      const msg = pendingAssignedToMeRes.error.message;
      setJobsError(msg);
      setPending([]);
      setActive([]);
      setHistory([]);
      setLoading(false);
      setRefreshing(false);
      return isRetriableJobsFetchError(msg) ? 'fail_retry' : 'fail_done';
    }
    const allPending = [...assignedToMe, ...unassigned].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const notExpired = allPending.filter((j) => !isJobExpired(j));

    const [activeRes, historyRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(BOOKINGS_JOB_LIST_SELECT)
        .eq('worker_id', workerId)
        .in('status', [BookingStatus.ACCEPTED, BookingStatus.ONGOING])
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('bookings')
        .select(BOOKINGS_JOB_LIST_SELECT)
        .eq('worker_id', workerId)
        .in('status', [BookingStatus.COMPLETED, BookingStatus.CANCELLED])
        .order('scheduled_date', { ascending: false })
        .limit(50),
    ]);
    if (activeRes.error || historyRes.error) {
      const msg = activeRes.error?.message ?? historyRes.error?.message ?? 'Could not load jobs.';
      setJobsError(msg);
      setPending(notExpired);
      setActive([]);
      setHistory([]);
      setLoading(false);
      setRefreshing(false);
      return isRetriableJobsFetchError(msg) ? 'fail_retry' : 'fail_done';
    }

    setPending(notExpired);
    setPendingJobsCount(notExpired.length);
    setActive((activeRes.data as JobRow[]) ?? []);
    setHistory((historyRes.data as JobRow[]) ?? []);
    setLoading(false);
    setRefreshing(false);
    return 'ok';
  }, [user?.id, workerId, setPendingJobsCount]);

  const fetchJobs = useCallback(async () => {
    if (fetchJobsMutexRef.current) {
      fetchJobsQueuedRef.current = true;
      return;
    }
    fetchJobsMutexRef.current = true;
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await runFetchJobsOnce();
        if (result === 'ok' || result === 'fail_done') break;
        if (result === 'fail_retry' && attempt < 3) {
          await sleep(400 * attempt);
          try {
            await supabase.auth.refreshSession();
          } catch {
            /* ignore */
          }
        }
      }
    } finally {
      fetchJobsMutexRef.current = false;
      if (fetchJobsQueuedRef.current) {
        fetchJobsQueuedRef.current = false;
        queueMicrotask(() => {
          void fetchJobsRef.current();
        });
      }
    }
  }, [runFetchJobsOnce]);

  fetchJobsRef.current = fetchJobs;

  useEffect(() => {
    if (!profileLoading) fetchJobs();
  }, [profileLoading, fetchJobs]);

  useEffect(() => {
    if (tabParam === 'pending' || tabParam === 'active' || tabParam === 'history') {
      setTab(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    if (!highlightParam) {
      highlightConsumedRef.current = null;
      return;
    }
    if (loading) return;
    const id = String(highlightParam);
    if (highlightConsumedRef.current === id) return;
    const all = [...pending, ...active, ...history];
    const found = all.find((j) => j.id === id);
    if (found) {
      setDetailJob(found);
      highlightConsumedRef.current = id;
    }
  }, [highlightParam, pending, active, history, loading]);

  // Clear the Jobs tab red dot once the user has seen the request jobs screen
  useFocusEffect(
    useCallback(() => {
      setPendingJobsCount(0);
    }, [setPendingJobsCount])
  );

  /** New pending jobs (pool / inserts). */
  useEffect(() => {
    if (!user?.id) return;
    const channel = subscribeToWorkerJobs(user.id, (payload: { eventType?: string }) => {
      if (payload.eventType === 'INSERT') {
        Alert.alert('Booking update', 'A new job request is available in Pending.');
      }
      void fetchJobs();
    });
    return () => {
      unsubscribe(channel);
    };
  }, [user?.id, fetchJobs]);

  /** Customer confirmed final price, status changes, etc. (UPDATE on assigned bookings). */
  useEffect(() => {
    if (!workerId) return;
    const channel = subscribeToWorkerBookingUpdates(
      workerId,
      (payload: {
        eventType?: string;
        new?: { status?: string } | null;
        old?: { status?: string } | null;
      }) => {
        if (payload.eventType === 'UPDATE') {
          const nextStatus = payload.new?.status ?? null;
          const prevStatus = payload.old?.status ?? null;
          if (nextStatus && prevStatus && nextStatus !== prevStatus) {
            const human =
              BOOKING_STATUS_ALERT_LABEL[nextStatus] ?? nextStatus.replace(/_/g, ' ');
            Alert.alert('Booking update', `This job is now ${human}.`);
          }
        }
        void fetchJobs();
      }
    );
    return () => {
      unsubscribe(channel);
    };
  }, [workerId, fetchJobs]);

  /** Keep open job modal in sync when lists refresh (e.g. realtime after price confirm). */
  useEffect(() => {
    setDetailJob((prev) => {
      if (!prev) return null;
      const updated = [...pending, ...active, ...history].find((j) => j.id === prev.id);
      return updated ?? prev;
    });
  }, [pending, active, history]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), fetchJobs()]);
  }, [refetchProfile, fetchJobs]);

  useRefreshOnAppActive(onRefresh);

  const acceptJob = useCallback(
    async (bookingId: string) => {
      if (!workerId) return;
      setActionId(bookingId);
      // Accept unassigned or pre-assigned (worker_id already = workerId)
      const { error } = await supabase
        .from('bookings')
        .update({ worker_id: workerId, status: BookingStatus.ACCEPTED } as never)
        .eq('id', bookingId)
        .eq('status', BookingStatus.PENDING);
      setActionId(null);
      if (error) {
        const msg = error.message?.includes('time slot')
          ? 'You already have another job overlapping this time (within 2 hours).'
          : error.message;
        Alert.alert('Cannot accept', msg);
      } else {
        fetchJobs();
        setTab('active');
      }
    },
    [workerId, fetchJobs]
  );

  const skipJob = useCallback(
    async (job?: JobRow) => {
      setDetailJob(null);
      if (!job) {
        fetchJobs();
        return;
      }
      // For direct requests assigned to this worker, reject should close the request for both sides.
      if (workerId && job.worker_id === workerId && job.status === BookingStatus.PENDING) {
        const { error } = await supabase
          .from('bookings')
          .update({ status: BookingStatus.CANCELLED } as never)
          .eq('id', job.id)
          .eq('worker_id', workerId)
          .eq('status', BookingStatus.PENDING);
        if (error) {
          Alert.alert('Could not reject', error.message);
        }
      }
      fetchJobs();
    },
    [fetchJobs, workerId]
  );

  const startJob = useCallback(
    async (bookingId: string) => {
      if (!workerId) return;
      const job =
        [...pending, ...active, ...history].find((j) => j.id === bookingId) ??
        (detailJob?.id === bookingId ? detailJob : null);
      if (job && needsCustomerPriceConfirm(job)) {
        Alert.alert(
          'Waiting for customer',
          'The customer must confirm the final price in their app before you can start this job.'
        );
        return;
      }
      Alert.alert('Start job?', 'Are you sure you want to mark this job as started?', [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            setActionId(bookingId);
            const { error } = await supabase
              .from('bookings')
              .update({ status: BookingStatus.ONGOING } as never)
              .eq('id', bookingId)
              .eq('worker_id', workerId);
            setActionId(null);
            if (error) Alert.alert('Error', error.message);
            else fetchJobs();
          },
        },
      ]);
    },
    [workerId, fetchJobs, pending, active, history, detailJob]
  );

  // Mark job complete; DB trigger calls Edge Function to charge customer (no app JWT needed).
  const completeJob = useCallback(
    async (bookingId: string) => {
      if (!workerId || !profile?.id) return;
      Alert.alert(
        'Mark complete?',
        'This will mark the job as completed and trigger payment processing.',
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Complete',
            onPress: async () => {
              setActionId(bookingId);
              const { error } = await supabase
                .from('bookings')
                .update({ status: BookingStatus.COMPLETED } as never)
                .eq('id', bookingId)
                .eq('worker_id', workerId);
              if (error) {
                setActionId(null);
                Alert.alert('Error', error.message);
                return;
              }
              const nextTotal = (profile.total_jobs_completed ?? 0) + 1;
              await supabase
                .from('worker_profiles')
                .update({ total_jobs_completed: nextTotal } as never)
                .eq('id', profile.id);
              setActionId(null);
              fetchJobs();
              refetchProfile();
            },
          },
        ]
      );
    },
    [workerId, profile?.id, profile?.total_jobs_completed, fetchJobs, refetchProfile]
  );

  const openChatWithCustomer = useCallback(
    async (job: JobRow) => {
      if (!workerId || !user?.id) {
        if (!workerId) router.push('/(tabs)/profile/setup');
        return;
      }
      const { data: byBooking } = await supabase
        .from('conversations')
        .select('id')
        .eq('booking_id', job.id)
        .maybeSingle();
      let convId = (byBooking as { id?: string } | null)?.id;
      if (!convId) {
        const { data: existingList } = await supabase
          .from('conversations')
          .select('id')
          .eq('customer_id', job.customer_id)
          .eq('worker_id', workerId)
          .order('updated_at', { ascending: false })
          .limit(1);
        const existing = Array.isArray(existingList) ? existingList[0] : existingList;
        convId = (existing as { id?: string } | null)?.id;
        if (convId) {
          await supabase
            .from('conversations')
            .update({ booking_id: job.id } as never)
            .eq('id', convId);
        }
      }
      if (!convId) {
        const { data: inserted } = await supabase
          .from('conversations')
          .insert({
            customer_id: job.customer_id,
            worker_id: workerId,
            booking_id: job.id,
          } as never)
          .select('id')
          .single();
        convId = (inserted as { id?: string } | null)?.id;
      }
      if (convId) {
        router.push(`/conversation/${convId}`);
      } else {
        Alert.alert('Error', 'Could not open chat.');
      }
    },
    [workerId, user?.id]
  );

  const list = tab === 'pending' ? pending : tab === 'active' ? active : history;

  if (profileLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerWrapper}>
          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Jobs</Text>
                <Text style={styles.headerSubtitle}>Manage your bookings</Text>
              </View>
              <View style={styles.headerSide} />
            </View>
          </SafeAreaView>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Jobs</Text>
            </View>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>

      {!workerId && (
        <TouchableOpacity
          style={styles.profileBanner}
          onPress={() => router.push('/(tabs)/profile/setup')}
          activeOpacity={0.8}
        >
          <Text style={styles.profileBannerText}>Complete your profile to accept jobs</Text>
          <Text style={styles.profileBannerCta}>Set up profile →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.tabs}>
        {(['pending', 'active', 'history'] as TabKey[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#000" style={styles.loader} />
        ) : jobsError ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>
              Could not load jobs. {formatJobsLoadErrorForDisplay(jobsError)}
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyState}>
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
          list.map((job) => {
            const msg = messageControlForStatus(job.status);
            return (
            <TouchableOpacity
              key={job.id}
              style={styles.card}
              onPress={() => router.push(`/job/${job.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <Text style={styles.serviceName}>{job.services?.name ?? 'Service'}</Text>
                <View style={styles.priceBlock}>
                  {job.total_amount != null ? (
                    <>
                      <Text style={styles.priceTotal}>${Number(job.total_amount).toFixed(2)}</Text>
                      <Text style={styles.pricePerHour}>
                        $
                        {Number(
                          job.price_locked_at ? (job.locked_hourly_rate ?? job.price) : job.price
                        ).toFixed(0)}
                        /hr
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.price}>${Number(job.price).toFixed(0)}/hr</Text>
                  )}
                </View>
              </View>
              <Text style={styles.meta}>
                {new Date(job.scheduled_date).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              {tab === 'pending' && job.response_deadline_at && (() => {
                const min = getMinutesLeft(job);
                if (min === null) return null;
                if (min <= 0) return <Text style={styles.expiryText}>Expired</Text>;
                return <Text style={styles.expiryText}>Expires in {min} min</Text>;
              })()}
              <Text style={styles.address} numberOfLines={2}>{job.address}</Text>
              {job.users && (
                <Text style={styles.customer}>Customer: {job.users.full_name}</Text>
              )}
              {(tab === 'pending' || tab === 'active' || tab === 'history') &&
                workerId &&
                isJobChatOpen(job.scheduled_date) && (
                  <TouchableOpacity
                    style={[styles.messageBtn, msg.surface]}
                    onPress={() => openChatWithCustomer(job)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubbles-outline" size={20} color={msg.icon} />
                    <Text style={[styles.messageBtnText, msg.label]}>Message customer</Text>
                  </TouchableOpacity>
                )}
              {tab === 'pending' && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonDecline]}
                    onPress={() => void skipJob(job)}
                  >
                    <Text style={styles.buttonTextDecline}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.buttonAccept,
                      (!workerId || isJobExpired(job)) && styles.buttonDisabled,
                    ]}
                    onPress={() => (workerId && !isJobExpired(job) ? acceptJob(job.id) : !workerId ? router.push('/(tabs)/profile/setup') : undefined)}
                    disabled={actionId === job.id || isJobExpired(job)}
                  >
                    {actionId === job.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.buttonTextAccept}>
                        {isJobExpired(job) ? 'Expired' : workerId ? 'Accept' : 'Complete profile to accept'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {tab === 'active' && job.status === BookingStatus.ACCEPTED && (
                <View style={styles.startJobBlock}>
                  {needsCustomerPriceConfirm(job) ? (
                    <Text style={styles.waitingConfirmHint}>
                      Waiting for customer to confirm the final price in the app.
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.buttonStart,
                      needsCustomerPriceConfirm(job) && styles.buttonStartWaiting,
                    ]}
                    onPress={() => startJob(job.id)}
                    disabled={actionId === job.id}
                  >
                    {actionId === job.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.buttonTextAccept}>Start job</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              {tab === 'active' && job.status === BookingStatus.ONGOING && (
                <TouchableOpacity
                  style={[styles.button, styles.buttonComplete]}
                  onPress={() => completeJob(job.id)}
                  disabled={actionId === job.id}
                >
                  {actionId === job.id ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.buttonTextAccept}>Mark complete</Text>
                  )}
                </TouchableOpacity>
              )}
              {tab === 'history' && (
                <View style={[styles.statusBadge, job.status === BookingStatus.COMPLETED ? styles.statusCompleted : styles.statusCancelled]}>
                  <Text
                    style={[
                      styles.statusText,
                      job.status === BookingStatus.CANCELLED && styles.statusTextMuted,
                    ]}
                  >
                    {job.status}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={!!detailJob}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailJob(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {detailJob ? (
              <JobDetailPanel
                job={detailJob}
                onClose={() => setDetailJob(null)}
                onMutateSuccess={fetchJobs}
                onAcceptedJob={() => setTab('active')}
              />
            ) : null}
          </View>
        </View>
      </Modal>
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    ...appScreenHeaderTitleStyle,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFEB3B',
  },
  profileBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  profileBannerCta: {
    fontSize: 13,
    color: '#F9A825',
    marginTop: 4,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  loader: {
    marginVertical: 24,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#C62828',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: '#FFEB3B',
    borderWidth: 1,
    borderColor: '#F9A825',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  priceBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  priceTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  pricePerHour: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  meta: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  expiryText: {
    fontSize: 12,
    color: '#E65100',
    marginTop: 4,
    fontWeight: '600',
  },
  address: {
    fontSize: 14,
    color: '#333',
    marginTop: 6,
  },
  customer: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  messageBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDecline: {
    backgroundColor: '#E0E0E0',
  },
  buttonAccept: {
    backgroundColor: '#FFEB3B',
  },
  buttonStart: {
    backgroundColor: '#FFF176',
    marginTop: 12,
  },
  buttonStartWaiting: {
    opacity: 0.85,
  },
  startJobBlock: {
    marginTop: 0,
  },
  waitingConfirmHint: {
    fontSize: 12,
    color: '#5D4037',
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 17,
  },
  waitingConfirmHintModal: {
    fontSize: 13,
    color: '#5D4037',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  waitingConfirmBanner: {
    fontSize: 12,
    color: '#5D4037',
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 17,
  },
  buttonComplete: {
    backgroundColor: '#81C784',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  buttonTextDecline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  buttonTextAccept: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 12,
  },
  statusCompleted: {
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  statusCancelled: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    textTransform: 'capitalize',
  },
  statusTextMuted: {
    color: '#616161',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  modalStatusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  /** Lighter than header (#FFEB3B); matches customer app booking status badge */
  modalChipYellow: {
    backgroundColor: '#FFF9C4',
    borderWidth: 1,
    borderColor: '#F9A825',
    borderRadius: 22,
  },
  modalChipCancelled: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 22,
  },
  modalStatusChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    textTransform: 'capitalize',
  },
  modalChipTextYellow: { color: '#000' },
  modalChipTextCancelled: { color: '#616161' },
  modalMessageCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalMessageCompactText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  modalChatClosedHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 18,
  },
  modalRow: {
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  modalValue: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  modalPriceBlock: {
    gap: 4,
  },
  modalPriceTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  modalPriceHint: {
    fontSize: 13,
    color: '#666',
  },
  modalLockedBadge: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '600',
    marginTop: 4,
  },
  modalPricePerHour: {
    fontSize: 14,
    color: '#666',
  },
  lockSection: {
    marginTop: 8,
    marginBottom: 12,
    padding: 14,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  lockSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  lockSectionHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    lineHeight: 18,
  },
  lockHoursInput: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
    marginBottom: 8,
  },
  lockPreview: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  buttonLock: {
    backgroundColor: '#FFEB3B',
  },
  /** Full width like Start job / Close in the modal */
  buttonLockFull: {
    width: '100%',
    alignSelf: 'stretch',
    flex: 0,
    paddingVertical: 14,
    minHeight: 48,
    borderRadius: 12,
  },
  buttonLockText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalSingleAction: {
    flex: 0,
    width: '100%',
    marginTop: 20,
  },
  /** Extra space below primary actions before Close (Start job, Accept, etc.) */
  modalBlockBeforeClose: {
    marginBottom: 16,
  },
  modalCloseBtn: {
    marginTop: 24,
    backgroundColor: '#FFEB3B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});

/** Lighter yellow (#FFF9C4) like customer app — message pill + list row */
function messageControlForStatus(status: string) {
  switch (status) {
    case BookingStatus.CANCELLED:
      return {
        surface: styles.modalChipCancelled,
        label: styles.modalChipTextCancelled,
        icon: '#616161' as const,
      };
    default:
      return {
        surface: styles.modalChipYellow,
        label: styles.modalChipTextYellow,
        icon: '#000' as const,
      };
  }
}
