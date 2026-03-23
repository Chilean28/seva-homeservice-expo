/**
 * Booking-linked chat closes 48 hours after the scheduled job time (both apps + RLS).
 */
export const JOB_CHAT_OPEN_HOURS = 48;

export function isJobChatOpen(
  scheduledDateIso: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (scheduledDateIso == null || scheduledDateIso === '') return true;
  const t = Date.parse(scheduledDateIso);
  if (Number.isNaN(t)) return true;
  return nowMs <= t + JOB_CHAT_OPEN_HOURS * 60 * 60 * 1000;
}
