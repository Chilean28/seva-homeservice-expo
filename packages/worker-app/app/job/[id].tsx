import { APP_SCREEN_HEADER_BG, appScreenHeaderBarPadding, appScreenHeaderTitleStyle } from '@seva/shared';
import { JobDetailPanel, normalizeBookingStatus } from '@/components/JobDetailPanel';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { JobRow } from '@/lib/types/jobRow';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';

const select = `
  id, customer_id, worker_id, service_id, status, scheduled_date, address, price, total_amount,
  estimated_duration_hours, estimated_total, locked_duration_hours, locked_hourly_rate, price_locked_at,
  price_confirmed_by_customer_at, price_lock_note,
  notes, created_at, completed_at, response_deadline_at, payment_method, payment_status,
  booking_refund_requests (id, status, reason, requested_at, error_message),
  services (name),
  users (full_name)
`;

function formatJobDetailErrorForDisplay(message: string): string {
  if (/typeerror|network request failed|fetch failed|aborted|timeout/i.test(message)) {
    return 'Could not reach the server. Check your connection and tap Retry.';
  }
  return message;
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { workerId, loading: profileLoading } = useWorkerProfile(user?.id);
  const [job, setJob] = useState<JobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setError(null);
    const { data, error: err } = await supabase.from('bookings').select(select).eq('id', id).maybeSingle();
    if (err) {
      setError(err.message);
      setJob(null);
      setLoading(false);
      return;
    }
    const row = data as JobRow | null;
    if (!row) {
      setError('Job not found');
      setJob(null);
      setLoading(false);
      return;
    }
    let effectiveWorkerId = workerId;
    if (!effectiveWorkerId && user?.id) {
      const { data: profileRow } = await supabase
        .from('worker_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      effectiveWorkerId = (profileRow as { id?: string } | null)?.id ?? null;
    }
    const st = normalizeBookingStatus(row.status);
    const allowed =
      (effectiveWorkerId && row.worker_id === effectiveWorkerId) ||
      (st === 'pending' && (row.worker_id === null || row.worker_id === effectiveWorkerId));
    if (!allowed) {
      setError('You do not have access to this job.');
      setJob(null);
      setLoading(false);
      return;
    }
    setJob(row);
    setLoading(false);
  }, [id, workerId, user?.id]);

  useEffect(() => {
    if (profileLoading) return;
    setLoading(true);
    void fetchJob();
  }, [fetchJob, profileLoading]);

  /** Realtime: customer confirmed final price, etc. */
  useEffect(() => {
    if (!id) return;
    let ch: RealtimeChannel | null = null;
    ch = supabase
      .channel(`worker-job-detail:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${id}`,
        },
        () => {
          void fetchJob();
        }
      )
      .subscribe();
    return () => {
      if (ch) void supabase.removeChannel(ch);
    };
  }, [id, fetchJob]);

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Job details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Job details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{formatJobDetailErrorForDisplay(error ?? 'Job not found')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void fetchJob(); }} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFEB3B" />
      <View style={styles.headerWrapper}>
        <SafeAreaView style={styles.headerSafe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Job details</Text>
            <View style={styles.headerSide} />
          </View>
        </SafeAreaView>
      </View>
      <View style={styles.body}>
        <JobDetailPanel
          job={job}
          onClose={() => router.back()}
          onMutateSuccess={fetchJob}
          onAcceptedJob={() => {}}
          showCloseButton={false}
          dismissOnWorkflowActions={false}
          showPanelTitle={false}
          hideMessageButton
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerWrapper: { backgroundColor: APP_SCREEN_HEADER_BG },
  headerSafe: { backgroundColor: APP_SCREEN_HEADER_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...appScreenHeaderBarPadding,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...appScreenHeaderTitleStyle },
  headerSide: { width: 32 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 15, color: '#FF3B30', textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#FFEB3B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#F9A825',
  },
  retryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
