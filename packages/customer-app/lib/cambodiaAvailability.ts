/** All worker availability windows use Cambodia time (ICT, UTC+7). */
export const CAMBODIA_TZ = 'Asia/Phnom_Penh';

export function getTodayCambodia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMBODIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Calendar `Date` → YYYY-MM-DD in Cambodia (matches `worker_availability_windows.work_date`). */
export function dateToCambodiaDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMBODIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function toCambodiaDateString(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Build UTC Date from Cambodia calendar date + minutes from local midnight */
export function cambodiaLocalToUtc(workDate: string, minutesFromMidnight: number): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const isoLocal = `${workDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`;
  return new Date(isoLocal);
}

export function formatCambodiaDateTime(d: Date): { dateStr: string; timeLabel: string } {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMBODIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: CAMBODIA_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return { dateStr, timeLabel };
}

export type AvailWindow = {
  work_date: string;
  start_minutes: number;
  end_minutes: number;
};

/** 30-minute slot starts (minutes from midnight) inside windows for work_date */
export function slotStartsForDate(windows: AvailWindow[], workDate: string): number[] {
  const dayWins = windows.filter((w) => w.work_date === workDate);
  const starts = new Set<number>();
  for (const w of dayWins) {
    for (let t = w.start_minutes; t < w.end_minutes; t += 30) {
      if (t + 30 <= w.end_minutes) starts.add(t);
    }
  }
  return [...starts].sort((a, b) => a - b);
}

export function minutesTo12h(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Must match review-booking MIN_HOURS and DB trigger (2h overlap). */
export const BOOKING_JOB_DURATION_MS = 2 * 60 * 60 * 1000;

/** Minutes from midnight in Cambodia for this instant. */
export function cambodiaMinutesFromMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMBODIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/**
 * Remove 30-min slot starts that would overlap an existing job (2h window),
 * matching `prevent_worker_double_booking` in the database.
 */
export function filterSlotStartsOccupiedByBookings(
  slotStartsMinutes: number[],
  workDate: string,
  bookingStarts: Date[]
): number[] {
  const JOB_MS = BOOKING_JOB_DURATION_MS;
  return slotStartsMinutes.filter((mins) => {
    const jobStart = cambodiaLocalToUtc(workDate, mins);
    const jobEnd = new Date(jobStart.getTime() + JOB_MS);
    const overlaps = bookingStarts.some((b) => {
      const bEnd = new Date(b.getTime() + JOB_MS);
      return jobStart < bEnd && jobEnd > b;
    });
    return !overlaps;
  });
}

/**
 * Drop slot starts whose start instant is before `nowMs` (default: now).
 * Matches create-booking validation: schedule must not be in the past.
 */
export function filterSlotStartsNotInPast(
  slotStartsMinutes: number[],
  workDate: string,
  nowMs: number = Date.now()
): number[] {
  return slotStartsMinutes.filter((mins) => cambodiaLocalToUtc(workDate, mins).getTime() >= nowMs);
}

/** Slot starts for a day from availability windows, excluding times taken by existing bookings. */
export function availableSlotStartsForDate(
  windows: AvailWindow[],
  workDate: string,
  bookingStarts: Date[],
  nowMs: number = Date.now()
): number[] {
  const raw = slotStartsForDate(windows, workDate);
  const unbooked = filterSlotStartsOccupiedByBookings(raw, workDate, bookingStarts);
  return filterSlotStartsNotInPast(unbooked, workDate, nowMs);
}
