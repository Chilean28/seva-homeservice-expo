import { supabase } from './client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { BookingStatus } from '../types/enums';

/**
 * Subscribe to booking status changes for a customer
 */
export function subscribeToCustomerBookings(
  customerId: string,
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel(`customer-bookings:${customerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `customer_id=eq.${customerId}`,
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to new job requests for a worker
 */
export function subscribeToWorkerJobs(
  workerId: string,
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel(`worker-jobs:${workerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `status=eq.pending`,
      },
      callback
    )
    .subscribe();
}

/**
 * Subscribe to booking status updates for a worker
 */
export function subscribeToWorkerBookingUpdates(
  workerId: string,
  callback: (payload: any) => void
): RealtimeChannel {
  return supabase
    .channel(`worker-booking-updates:${workerId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bookings',
        filter: `worker_id=eq.${workerId}`,
      },
      callback
    )
    .subscribe();
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribe(channel: RealtimeChannel) {
  return supabase.removeChannel(channel);
}
