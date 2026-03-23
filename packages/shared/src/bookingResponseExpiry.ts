/**
 * Pending booking whose worker response window has passed (worker can no longer accept).
 * The row may still be `status = 'pending'` until cancelled by a job or app logic.
 */
export function isPendingBookingResponseExpired(
  status: string,
  responseDeadlineAt: string | null | undefined
): boolean {
  if (status !== 'pending') return false;
  if (responseDeadlineAt == null || responseDeadlineAt === '') return false;
  return new Date(responseDeadlineAt).getTime() <= Date.now();
}
