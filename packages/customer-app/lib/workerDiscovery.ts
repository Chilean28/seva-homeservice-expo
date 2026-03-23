import { getTodayCambodia } from '@/lib/cambodiaAvailability';
import { supabase } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Worker profile IDs with at least one `worker_availability_windows` row on or after
 * `fromDate` (Cambodia calendar, YYYY-MM-DD).
 * Returns `null` if the RPC fails (caller should not filter — avoids empty home on errors).
 */
export async function fetchWorkerIdsWithUpcomingAvailability(
  fromDate?: string
): Promise<Set<string> | null> {
  const p_from_date = fromDate ?? getTodayCambodia();
  const { data, error } = await (supabase as SupabaseClient).rpc(
    'worker_ids_with_upcoming_availability',
    { p_from_date }
  );
  if (error) {
    console.warn('[workerDiscovery] worker_ids_with_upcoming_availability:', error.message);
    return null;
  }
  const ids = (data as string[] | null) ?? [];
  return new Set(ids);
}

export type SearchDateFilter = 'any' | 'today' | 'within_3_days' | 'within_week';
export type SearchTimeFilter = 'flexible' | 'morning' | 'afternoon' | 'evening';

/** How far ahead to scan when date = "any" but time is constrained (keeps query bounded). */
const ANY_DATE_RANGE_DAYS = 90;

function addDaysYmd(ymd: string, days: number): string {
  const parts = ymd.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function timeFilterToOverlapMinutes(timeFilter: SearchTimeFilter): { start: number; end: number } | null {
  switch (timeFilter) {
    case 'flexible':
      return null;
    case 'morning':
      return { start: 8 * 60, end: 11 * 60 };
    case 'afternoon':
      return { start: 12 * 60, end: 15 * 60 };
    case 'evening':
      return { start: 16 * 60, end: 20 * 60 };
    default:
      return null;
  }
}

async function rpcAvailabilityInRange(
  dateStart: string,
  dateEnd: string,
  timeStart: number | null,
  timeEnd: number | null
): Promise<Set<string> | null> {
  const { data, error } = await (supabase as SupabaseClient).rpc('worker_ids_with_availability_in_range', {
    p_date_start: dateStart,
    p_date_end: dateEnd,
    p_time_start_minutes: timeStart,
    p_time_end_minutes: timeEnd,
  });
  if (error) {
    console.warn('[workerDiscovery] worker_ids_with_availability_in_range:', error.message);
    return null;
  }
  const ids = (data as string[] | null) ?? [];
  return new Set(ids);
}

/**
 * Worker IDs matching customer search date/time filters (Cambodia calendar + minutes from midnight).
 * Returns `null` on RPC failure so callers can skip filtering.
 */
export async function fetchWorkerIdsForSearch(
  dateFilter: SearchDateFilter,
  timeFilter: SearchTimeFilter
): Promise<Set<string> | null> {
  const today = getTodayCambodia();
  const overlap = timeFilterToOverlapMinutes(timeFilter);
  const tStart = overlap?.start ?? null;
  const tEnd = overlap?.end ?? null;

  if (dateFilter === 'any' && timeFilter === 'flexible') {
    return fetchWorkerIdsWithUpcomingAvailability(today);
  }

  let dateStart = today;
  let dateEnd = addDaysYmd(today, ANY_DATE_RANGE_DAYS);

  switch (dateFilter) {
    case 'any':
      dateStart = today;
      dateEnd = addDaysYmd(today, ANY_DATE_RANGE_DAYS);
      break;
    case 'today':
      dateStart = today;
      dateEnd = today;
      break;
    case 'within_3_days':
      dateStart = today;
      dateEnd = addDaysYmd(today, 3);
      break;
    case 'within_week':
      dateStart = today;
      dateEnd = addDaysYmd(today, 7);
      break;
    default:
      break;
  }

  return rpcAvailabilityInRange(dateStart, dateEnd, tStart, tEnd);
}
