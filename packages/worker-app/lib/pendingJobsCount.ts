import { supabase } from '@/lib/supabase/client';
import { BookingStatus } from '@/lib/types/enums';

type DeadlineRow = { response_deadline_at: string | null };

function isJobExpired(row: DeadlineRow): boolean {
  if (!row.response_deadline_at) return false;
  return new Date(row.response_deadline_at).getTime() <= Date.now();
}

/**
 * Same rules as (tabs)/jobs.tsx fetchJobs pending tab: pool jobs (worker_id null) +
 * pending assigned to this worker, excluding expired response deadlines.
 */
export async function fetchPendingJobRequestCount(userId: string): Promise<number> {
  const { data: wp } = await supabase
    .from('worker_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  const workerId = (wp as { id: string } | null)?.id ?? null;

  const pendingUnassignedRes = await supabase
    .from('bookings')
    .select('id, response_deadline_at')
    .eq('status', BookingStatus.PENDING)
    .is('worker_id', null)
    .order('created_at', { ascending: false });
  const unassigned = (pendingUnassignedRes.data ?? []) as DeadlineRow[];

  if (!workerId) {
    return unassigned.filter((j) => !isJobExpired(j)).length;
  }

  const pendingAssignedToMeRes = await supabase
    .from('bookings')
    .select('id, response_deadline_at')
    .eq('status', BookingStatus.PENDING)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });
  const assignedToMe = (pendingAssignedToMeRes.data ?? []) as DeadlineRow[];
  const allPending = [...assignedToMe, ...unassigned];
  return allPending.filter((j) => !isJobExpired(j)).length;
}
