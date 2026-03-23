import type { SupabaseClient } from '@supabase/supabase-js';
import { BookingStatus } from '@/lib/types/enums';

export type CompleteBookingParams = {
  customer_id: string;
  service_id: string;
  scheduled_date_iso: string;
  address: string;
  price: number;
  total_amount?: number;
  notes?: string;
  worker_id?: string;
  /** Service location (required for pool visibility / RLS). */
  latitude?: number;
  longitude?: number;
  payment_method: 'card' | 'cash';
  payment_status: 'unpaid' | 'pending' | 'paid' | 'refunded';
  stripe_payment_intent_id?: string;
  stripe_payment_method_id?: string;
};

export async function completeBooking(
  supabase: SupabaseClient,
  params: CompleteBookingParams
): Promise<{ error: string | null }> {
  const {
    customer_id,
    service_id,
    scheduled_date_iso,
    address,
    price,
    total_amount,
    notes,
    worker_id,
    latitude,
    longitude,
    payment_method,
    payment_status,
    stripe_payment_intent_id,
    stripe_payment_method_id,
  } = params;

  if (!customer_id || !service_id || !address.trim()) {
    return { error: 'Missing booking details.' };
  }

  const scheduled = new Date(scheduled_date_iso);
  const insertPayload = {
    customer_id,
    service_id,
    status: BookingStatus.PENDING,
    scheduled_date: scheduled.toISOString(),
    address: address.trim(),
    price,
    estimated_duration_hours: 2,
    ...(total_amount != null ? { estimated_total: total_amount, total_amount } : {}),
    notes: notes?.trim() || undefined,
    payment_method,
    payment_status,
    ...(stripe_payment_intent_id ? { stripe_payment_intent_id } : {}),
    ...(stripe_payment_method_id ? { stripe_payment_method_id } : {}),
    ...(worker_id ? { worker_id } : {}),
    ...(latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)
      ? { latitude, longitude }
      : {}),
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('bookings')
    .insert(insertPayload as never)
    .select('id')
    .single();

  if (insertErr) {
    const msg = insertErr.message ?? '';
    if (msg.includes('time slot is no longer available')) {
      return { error: 'This time slot is no longer available. Please choose another time.' };
    }
    return { error: insertErr.message };
  }

  const newBookingId = (inserted as { id?: string } | null)?.id;

  if (worker_id && newBookingId) {
    try {
      await supabase.functions.invoke('send-push', {
        body: {
          booking_id: newBookingId,
          title: 'New booking',
          body: 'A customer requested a booking. Open the app to view.',
        },
      });
    } catch (_) {}
  }

  return { error: null };
}
