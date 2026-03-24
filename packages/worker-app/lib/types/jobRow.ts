/** Worker Jobs / booking row shape (list + detail). */
export type JobRow = {
  id: string;
  customer_id: string;
  worker_id: string | null;
  service_id: string;
  status: string;
  scheduled_date: string;
  address: string;
  price: number;
  total_amount: number | null;
  estimated_duration_hours: number | null;
  estimated_total: number | null;
  locked_duration_hours: number | null;
  /** Locked hourly rate when locking; if null after lock, UI treats as `price`. */
  locked_hourly_rate: number | null;
  price_locked_at: string | null;
  price_confirmed_by_customer_at: string | null;
  /** Optional worker explanation when locking adjusted rate/hours. */
  price_lock_note: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  response_deadline_at: string | null;
  payment_method?: 'card' | 'cash' | null;
  payment_status?: 'unpaid' | 'pending' | 'paid' | 'refunded' | null;
  booking_refund_requests?: {
    id: string;
    status: 'requested' | 'worker_confirmed' | 'processing' | 'succeeded' | 'failed' | 'rejected' | 'expired';
    reason: string | null;
    requested_at: string;
    error_message: string | null;
  }[] | null;
  services: { name: string } | null;
  users: { full_name: string } | null;
};
