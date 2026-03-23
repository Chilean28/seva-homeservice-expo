import { supabase } from '@/lib/supabase/client';
import type { WorkerAvailabilityWindow } from '@/lib/types/database';

/** Availability is always interpreted in Cambodia (ICT). */
export const WORKER_SCHEDULE_TZ = 'Asia/Phnom_Penh';

export function getTodayScheduleDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WORKER_SCHEDULE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add calendar days to a YYYY-MM-DD schedule date (ICT calendar semantics). */
export function addScheduleCalendarDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  const u = new Date(t);
  const yy = u.getUTCFullYear();
  const mo = u.getUTCMonth() + 1;
  const dd = u.getUTCDate();
  return `${yy}-${mo.toString().padStart(2, '0')}-${dd.toString().padStart(2, '0')}`;
}

export function minutesToLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function formatWindowDate(workDate: string): string {
  const [y, mo, d] = workDate.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export async function fetchAvailabilityWindows(
  workerId: string,
  fromDate: string
): Promise<WorkerAvailabilityWindow[]> {
  const { data, error } = await supabase
    .from('worker_availability_windows')
    .select('id, worker_id, work_date, start_minutes, end_minutes, created_at')
    .eq('worker_id', workerId)
    .gte('work_date', fromDate)
    .order('work_date', { ascending: true })
    .order('start_minutes', { ascending: true });
  if (error) return [];
  return (data as WorkerAvailabilityWindow[]) ?? [];
}

/** True when worker has at least one availability slot. */
export async function hasAvailabilityWindows(workerId: string, _fromDate?: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('worker_availability_windows')
    .select('id', { count: 'exact', head: true })
    .eq('worker_id', workerId);

  if (error) return false;
  return (count ?? 0) > 0;
}

export async function insertAvailabilityWindows(
  workerId: string,
  dates: string[],
  startMinutes: number,
  endMinutes: number
): Promise<{ inserted: number; skipped: number }> {
  if (dates.length === 0 || endMinutes <= startMinutes) return { inserted: 0, skipped: 0 };

  const { data: existing } = await supabase
    .from('worker_availability_windows')
    .select('work_date, start_minutes, end_minutes')
    .eq('worker_id', workerId)
    .in('work_date', dates);

  const existingSet = new Set(
    ((existing as { work_date: string; start_minutes: number; end_minutes: number }[]) ?? []).map(
      (r) => `${r.work_date}|${r.start_minutes}|${r.end_minutes}`
    )
  );

  const rows: { worker_id: string; work_date: string; start_minutes: number; end_minutes: number }[] = [];
  let skipped = 0;
  for (const work_date of dates) {
    const key = `${work_date}|${startMinutes}|${endMinutes}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }
    rows.push({ worker_id: workerId, work_date, start_minutes: startMinutes, end_minutes: endMinutes });
    existingSet.add(key);
  }

  if (rows.length === 0) return { inserted: 0, skipped };

  const { error } = await supabase.from('worker_availability_windows').insert(rows as never);
  if (error) return { inserted: 0, skipped: dates.length };
  return { inserted: rows.length, skipped };
}

export type AvailabilityTimeRange = { start_minutes: number; end_minutes: number };

/** Insert multiple windows per day (e.g. morning + afternoon). Skips duplicates. */
export async function insertAvailabilityRanges(
  workerId: string,
  dates: string[],
  ranges: AvailabilityTimeRange[]
): Promise<{ inserted: number; skipped: number }> {
  const valid = ranges.filter((r) => r.end_minutes > r.start_minutes);
  if (dates.length === 0 || valid.length === 0) return { inserted: 0, skipped: 0 };

  const { data: existing } = await supabase
    .from('worker_availability_windows')
    .select('work_date, start_minutes, end_minutes')
    .eq('worker_id', workerId)
    .in('work_date', dates);

  const existingSet = new Set(
    ((existing as { work_date: string; start_minutes: number; end_minutes: number }[]) ?? []).map(
      (r) => `${r.work_date}|${r.start_minutes}|${r.end_minutes}`
    )
  );

  const rows: {
    worker_id: string;
    work_date: string;
    start_minutes: number;
    end_minutes: number;
  }[] = [];
  let skipped = 0;
  for (const work_date of dates) {
    for (const { start_minutes, end_minutes } of valid) {
      const key = `${work_date}|${start_minutes}|${end_minutes}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      rows.push({ worker_id: workerId, work_date, start_minutes, end_minutes });
      existingSet.add(key);
    }
  }

  if (rows.length === 0) return { inserted: 0, skipped };

  const { error } = await supabase.from('worker_availability_windows').insert(rows as never);
  if (error) return { inserted: 0, skipped: dates.length * valid.length };
  return { inserted: rows.length, skipped };
}

export async function deleteAvailabilityWindow(id: string): Promise<boolean> {
  const { error } = await supabase.from('worker_availability_windows').delete().eq('id', id);
  return !error;
}
