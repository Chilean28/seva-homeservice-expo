/** Matches customer review-booking: total = hourly × hours (no sales tax line; promos apply on customer side only). */
export const BOOKING_DEFAULT_ESTIMATED_HOURS = 2;
/** Worker lock UI: hourly rate bounds (must match DB CHECK on bookings.locked_hourly_rate). */
export const BOOKING_MIN_HOURLY_RATE = 0.01;
export const BOOKING_MAX_HOURLY_RATE = 9999.99;

export function computeBookingTotalFromHours(hourlyRate: number, hours: number): number {
  if (hourlyRate < 0 || hours <= 0) return 0;
  const subtotal = hourlyRate * hours;
  return Math.round(subtotal * 100) / 100;
}
