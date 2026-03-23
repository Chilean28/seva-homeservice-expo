import { useWorkerProfile } from '@/lib/hooks/useWorkerProfile';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { BookingStatus } from '@/lib/types/enums';
import type { JobRow } from '@/lib/types/jobRow';
import {
  BOOKING_MAX_HOURLY_RATE,
  BOOKING_MIN_HOURLY_RATE,
  computeBookingTotalFromHours,
  isJobChatOpen,
} from '@seva/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Props = {
  job: JobRow;
  /** Called when the user dismisses (Close, Not now) or after actions that close the modal in jobs */
  onClose: () => void;
  /** Refetch lists / job after mutations */
  onMutateSuccess: () => void | Promise<void>;
  /** Jobs tab: switch to Active after accepting */
  onAcceptedJob?: () => void;
  /** Show bottom "Close" button (jobs modal). Hidden on standalone job screen (use header back). */
  showCloseButton?: boolean;
  /**
   * Jobs modal: close sheet before accept/start/lock/complete (legacy behavior).
   * Standalone job screen: keep open and refetch; only go back after mark complete.
   */
  dismissOnWorkflowActions?: boolean;
  /** Show "Job details" title inside the panel (jobs modal). Standalone screen uses header only. */
  showPanelTitle?: boolean;
  /** Hide Message CTA (e.g. opened from chat — user is already messaging). */
  hideMessageButton?: boolean;
};

/** Postgres / Supabase may return enum as string; normalize before comparing. */
export function normalizeBookingStatus(status: string | null | undefined): string {
  return String(status ?? '')
    .trim()
    .toLowerCase();
}

function statusDisplayLabel(status: string | null | undefined): string {
  const s = normalizeBookingStatus(status);
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'ongoing':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
  }
}

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

function needsCustomerPriceConfirm(job: JobRow): boolean {
  return (
    !!job.price_locked_at &&
    !job.price_confirmed_by_customer_at &&
    normalizeBookingStatus(job.status) === 'accepted'
  );
}

export function JobDetailPanel({
  job,
  onClose,
  onMutateSuccess,
  onAcceptedJob,
  showCloseButton = true,
  dismissOnWorkflowActions = true,
  showPanelTitle = true,
  hideMessageButton = false,
}: Props) {
  const { user } = useAuth();
  const { profile, workerId, refetch: refetchProfile } = useWorkerProfile(user?.id);
  const [lockHoursInput, setLockHoursInput] = useState('2');
  const [lockRateInput, setLockRateInput] = useState('');
  const [lockNoteInput, setLockNoteInput] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const h = job.locked_duration_hours ?? job.estimated_duration_hours ?? 2;
    setLockHoursInput(String(h));
    setLockRateInput(String(Number(job.price)));
    setLockNoteInput('');
  }, [job.id, job.locked_duration_hours, job.estimated_duration_hours, job.price]);

  const lockPrice = useCallback(async () => {
    if (!workerId) return;
    const h = parseFloat(lockHoursInput.replace(',', '.'));
    if (Number.isNaN(h) || h < 0.5 || h > 48) {
      Alert.alert('Invalid hours', 'Enter billable hours between 0.5 and 48.');
      return;
    }
    const rate = parseFloat(lockRateInput.replace(',', '.'));
    if (Number.isNaN(rate) || rate < BOOKING_MIN_HOURLY_RATE || rate > BOOKING_MAX_HOURLY_RATE) {
      Alert.alert(
        'Invalid hourly rate',
        `Enter an hourly rate between $${BOOKING_MIN_HOURLY_RATE} and $${BOOKING_MAX_HOURLY_RATE.toFixed(2)}/hr.`
      );
      return;
    }
    const noteTrim = lockNoteInput.trim();
    if (noteTrim.length > 500) {
      Alert.alert('Note too long', 'Keep the note to 500 characters or less.');
      return;
    }
    const total = computeBookingTotalFromHours(rate, h);
    setLockBusy(true);
    const { error } = await supabase
      .from('bookings')
      .update({
        locked_duration_hours: h,
        locked_hourly_rate: rate,
        price_lock_note: noteTrim.length > 0 ? noteTrim : null,
        price_locked_at: new Date().toISOString(),
        total_amount: total,
      } as never)
      .eq('id', job.id)
      .eq('worker_id', workerId)
      .is('price_locked_at', null)
      .in('status', [BookingStatus.ACCEPTED, BookingStatus.ONGOING]);
    setLockBusy(false);
    if (error) {
      Alert.alert('Could not lock price', error.message);
      return;
    }
    try {
      await invokeEdgeFunction('send-push', {
        booking_id: job.id,
        title: 'Confirm your final price',
        body: `Total $${total.toFixed(2)} (${h}h @ $${rate.toFixed(2)}/hr). Open the app and confirm so your worker can start.`,
      });
    } catch (_) {
      /* optional */
    }
    if (dismissOnWorkflowActions) onClose();
    void onMutateSuccess();
  }, [job, workerId, lockHoursInput, lockRateInput, lockNoteInput, dismissOnWorkflowActions, onClose, onMutateSuccess]);

  const acceptJob = useCallback(async () => {
    if (!workerId) return;
    if (dismissOnWorkflowActions) onClose();
    setActionId(job.id);
    const { error } = await supabase
      .from('bookings')
      .update({ worker_id: workerId, status: BookingStatus.ACCEPTED } as never)
      .eq('id', job.id)
      .eq('status', BookingStatus.PENDING);
    setActionId(null);
    if (error) {
      const msg = error.message?.includes('time slot')
        ? 'You already have another job overlapping this time (within 2 hours).'
        : error.message;
      Alert.alert('Cannot accept', msg);
    } else {
      void onMutateSuccess();
      onAcceptedJob?.();
    }
  }, [workerId, job.id, dismissOnWorkflowActions, onClose, onMutateSuccess, onAcceptedJob]);

  const startJob = useCallback(async () => {
    if (!workerId) return;
    if (needsCustomerPriceConfirm(job)) {
      Alert.alert(
        'Waiting for customer',
        'The customer must confirm the final price in their app before you can start this job.'
      );
      return;
    }
    if (dismissOnWorkflowActions) onClose();
    setActionId(job.id);
    const { error } = await supabase
      .from('bookings')
      .update({ status: BookingStatus.ONGOING } as never)
      .eq('id', job.id)
      .eq('worker_id', workerId);
    setActionId(null);
    if (error) Alert.alert('Error', error.message);
    else void onMutateSuccess();
  }, [workerId, job, dismissOnWorkflowActions, onClose, onMutateSuccess]);

  const completeJob = useCallback(async () => {
    if (!workerId || !profile?.id) return;
    if (dismissOnWorkflowActions) onClose();
    setActionId(job.id);
    const { error } = await supabase
      .from('bookings')
      .update({ status: BookingStatus.COMPLETED } as never)
      .eq('id', job.id)
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
    void onMutateSuccess();
    void refetchProfile();
    if (!dismissOnWorkflowActions) onClose();
  }, [
    workerId,
    profile?.id,
    profile?.total_jobs_completed,
    job.id,
    dismissOnWorkflowActions,
    onClose,
    onMutateSuccess,
    refetchProfile,
  ]);

  const openChatWithCustomer = useCallback(async () => {
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
      onClose();
      router.push(`/conversation/${convId}`);
    } else {
      Alert.alert('Error', 'Could not open chat.');
    }
  }, [workerId, user?.id, job.id, job.customer_id, onClose]);

  const statusNorm = normalizeBookingStatus(job.status);
  const detailMessageControl = messageControlForStatus(statusNorm);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {showPanelTitle ? <Text style={styles.modalTitle}>Job details</Text> : null}
      <View style={styles.modalTopBar}>
        <View
          style={[
            styles.modalStatusChip,
            statusNorm === 'cancelled' ? styles.modalChipCancelled : styles.modalChipYellow,
          ]}
        >
          <Text
            style={[
              styles.modalStatusChipText,
              statusNorm === 'cancelled' ? styles.modalChipTextCancelled : styles.modalChipTextYellow,
            ]}
          >
            {statusDisplayLabel(job.status)}
          </Text>
        </View>
        {!hideMessageButton &&
        workerId &&
        isJobChatOpen(job.scheduled_date) &&
        detailMessageControl ? (
          <TouchableOpacity
            style={[styles.modalMessageRow, detailMessageControl.surface]}
            onPress={openChatWithCustomer}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={detailMessageControl.icon} />
            <Text style={[styles.modalMessageCompactText, detailMessageControl.label]}>Message</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.modalRow}>
        <Text style={styles.modalLabel}>Service</Text>
        <Text style={styles.modalValue}>{job.services?.name ?? 'Service'}</Text>
      </View>
      <View style={styles.modalRow}>
        <Text style={styles.modalLabel}>Price</Text>
        <View style={styles.modalPriceBlock}>
          <Text style={styles.modalPricePerHour}>Booked rate: ${Number(job.price).toFixed(2)}/hr</Text>
          {job.estimated_total != null && (
            <Text style={styles.modalPriceHint}>
              Estimate ({Number(job.estimated_duration_hours ?? 2)}h min): $
              {Number(job.estimated_total).toFixed(2)}
            </Text>
          )}
          {job.total_amount != null && (
            <Text style={styles.modalPriceTotal}>
              {job.price_locked_at ? 'Final total' : 'Current total'}: ${Number(job.total_amount).toFixed(2)}
            </Text>
          )}
          {job.price_locked_at && job.locked_duration_hours != null ? (
            <>
              <Text style={styles.modalLockedBadge}>
                Locked {Number(job.locked_duration_hours)}h @ $
                {Number(job.locked_hourly_rate ?? job.price).toFixed(2)}
                /hr · {new Date(job.price_locked_at).toLocaleDateString()}
              </Text>
              {job.price_lock_note ? (
                <Text style={styles.priceLockNote}>{job.price_lock_note}</Text>
              ) : null}
            </>
          ) : null}
          {needsCustomerPriceConfirm(job) ? (
            <Text style={styles.waitingConfirmBanner}>
              Waiting for customer to confirm this total in the app before you can start.
            </Text>
          ) : null}
        </View>
      </View>

      {workerId &&
      !job.price_locked_at &&
      (statusNorm === 'accepted' || statusNorm === 'ongoing') ? (
        <View style={styles.lockSection}>
          <Text style={styles.lockSectionTitle}>Set final hours & hourly rate</Text>
          <Text style={styles.lockSectionHint}>
            Adjust billable hours and/or your hourly rate for this job, then lock the total the customer will pay.
            Add a short note if something changed (optional).
          </Text>
          <Text style={styles.lockFieldLabel}>Hourly rate ($/hr)</Text>
          <TextInput
            style={styles.lockHoursInput}
            value={lockRateInput}
            onChangeText={setLockRateInput}
            keyboardType="decimal-pad"
            placeholder="e.g. 45"
            placeholderTextColor="#999"
          />
          <Text style={styles.lockFieldLabel}>Billable hours</Text>
          <TextInput
            style={styles.lockHoursInput}
            value={lockHoursInput}
            onChangeText={setLockHoursInput}
            keyboardType="decimal-pad"
            placeholder="e.g. 3"
            placeholderTextColor="#999"
          />
          <Text style={styles.lockFieldLabel}>Note to customer (optional)</Text>
          <TextInput
            style={styles.lockNoteInput}
            value={lockNoteInput}
            onChangeText={(t) => setLockNoteInput(t.length > 500 ? t.slice(0, 500) : t)}
            placeholder="e.g. Extra materials needed for leak repair"
            placeholderTextColor="#999"
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.lockPreview}>
            Preview: $
            {(() => {
              const previewH = Math.max(0.5, parseFloat(lockHoursInput.replace(',', '.')) || 0.5);
              const previewR = parseFloat(lockRateInput.replace(',', '.'));
              if (
                Number.isNaN(previewR) ||
                previewR < BOOKING_MIN_HOURLY_RATE ||
                previewR > BOOKING_MAX_HOURLY_RATE
              ) {
                return '—';
              }
              return computeBookingTotalFromHours(previewR, previewH).toFixed(2);
            })()}{' '}
            total
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonLock, styles.buttonLockFull, lockBusy && styles.buttonDisabled]}
            onPress={lockPrice}
            disabled={lockBusy}
          >
            {lockBusy ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.buttonLockText}>Lock final price</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.modalRow}>
        <Text style={styles.modalLabel}>Date & time</Text>
        <Text style={styles.modalValue}>
          {new Date(job.scheduled_date).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <View style={styles.modalRow}>
        <Text style={styles.modalLabel}>Address</Text>
        <Text style={styles.modalValue}>{job.address}</Text>
      </View>
      {job.users && (
        <View style={styles.modalRow}>
          <Text style={styles.modalLabel}>Customer</Text>
          <Text style={styles.modalValue}>{job.users.full_name}</Text>
        </View>
      )}
      {!isJobChatOpen(job.scheduled_date) && workerId ? (
        <Text style={styles.modalChatClosedHint}>
          Messaging closed — chat ends 48 hours after the scheduled job time.
        </Text>
      ) : null}
      {job.notes ? (
        <View style={styles.modalRow}>
          <Text style={styles.modalLabel}>Notes</Text>
          <Text style={styles.modalValue}>{job.notes}</Text>
        </View>
      ) : null}

      {statusNorm === 'pending' &&
        job.response_deadline_at &&
        (() => {
          const min = getMinutesLeft(job);
          if (min === null) return null;
          return (
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Time to accept</Text>
              <Text style={styles.modalValue}>{min <= 0 ? 'Expired' : `${min} min left`}</Text>
            </View>
          );
        })()}

      {statusNorm === 'pending' && (
        <View style={[styles.modalActions, styles.modalBlockBeforeClose]}>
          <TouchableOpacity
            style={[styles.button, styles.buttonDecline]}
            onPress={() => {
              onClose();
              void onMutateSuccess();
            }}
          >
            <Text style={styles.buttonTextDecline}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonAccept, (!workerId || isJobExpired(job)) && styles.buttonDisabled]}
            onPress={() => {
              if (workerId && !isJobExpired(job)) {
                void acceptJob();
              } else if (!workerId) {
                onClose();
                router.push('/(tabs)/profile/setup');
              }
            }}
            disabled={!workerId || actionId === job.id || isJobExpired(job)}
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

      {statusNorm === 'accepted' && (
        <View style={[styles.modalSingleAction, styles.modalBlockBeforeClose]}>
          {needsCustomerPriceConfirm(job) ? (
            <Text style={styles.waitingConfirmHintModal}>
              Customer must confirm the final price in the app before you can start.
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonStart,
              needsCustomerPriceConfirm(job) && styles.buttonStartWaiting,
            ]}
            onPress={startJob}
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

      {statusNorm === 'ongoing' && (
        <TouchableOpacity
          style={[styles.button, styles.buttonComplete, styles.modalSingleAction, styles.modalBlockBeforeClose]}
          onPress={completeJob}
          disabled={actionId === job.id}
        >
          {actionId === job.id ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.buttonTextAccept}>Mark complete</Text>
          )}
        </TouchableOpacity>
      )}

      {showCloseButton ? (
        <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.modalCloseBtnText}>Close</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function messageControlForStatus(statusNorm: string) {
  switch (statusNorm) {
    case 'cancelled':
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

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 24 },
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
  },
  modalChipTextYellow: { color: '#000' },
  modalChipTextCancelled: { color: '#616161' },
  /** Layout for message pill; background/border come from messageControlForStatus surface */
  modalMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  modalMessageCompactText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
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
  lockFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
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
    marginBottom: 10,
  },
  lockNoteInput: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#000',
    marginBottom: 10,
    minHeight: 72,
  },
  priceLockNote: {
    fontSize: 13,
    color: '#444',
    marginTop: 6,
    lineHeight: 18,
  },
  lockPreview: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonLock: {
    backgroundColor: '#FFEB3B',
  },
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
  modalBlockBeforeClose: {
    marginBottom: 6,
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
  waitingConfirmBanner: {
    fontSize: 12,
    color: '#5D4037',
    fontWeight: '600',
    marginTop: 8,
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
  modalChatClosedHint: {
    fontSize: 13,
    color: '#888',
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 18,
  },
  modalCloseBtn: {
    marginTop: 10,
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
