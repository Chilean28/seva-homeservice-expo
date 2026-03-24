import { BookingStatus, UserType } from './enums';

export interface User {
  id: string;
  user_type: UserType;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

export interface WorkerProfile {
  id: string;
  user_id: string;
  bio?: string;
  experience_years?: number;
  rating_average: number;
  total_jobs_completed: number;
  is_available: boolean;
  latitude?: number;
  longitude?: number;
  location_display_name?: string | null;
  location_link?: string | null;
  phone?: string | null;
  phone_verified_at?: string | null;
  id_document_url?: string | null;
  id_uploaded_at?: string | null;
  stripe_connect_account_id?: string | null;
  /** IANA timezone for availability windows (e.g. America/New_York) */
  availability_timezone?: string | null;
}

export interface WorkerAvailabilityWindow {
  id: string;
  worker_id: string;
  work_date: string;
  start_minutes: number;
  end_minutes: number;
  created_at: string;
}

export interface WorkerPortfolioPhoto {
  id: string;
  worker_id: string;
  photo_url: string;
  sort_order: number;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  icon_name?: string;
  base_price: number;
  is_active: boolean;
}

export interface ServiceSubscription {
  id: string;
  worker_id: string;
  service_id: string;
  custom_price?: number;
}

export interface Booking {
  id: string;
  customer_id: string;
  worker_id?: string;
  service_id: string;
  status: BookingStatus;
  scheduled_date: string;
  address: string;
  latitude?: number;
  longitude?: number;
  price: number;
  total_amount?: number | null;
  estimated_duration_hours?: number;
  estimated_total?: number | null;
  locked_duration_hours?: number | null;
  /** Locked hourly rate at job lock; if omitted when locked, same as `price`. */
  locked_hourly_rate?: number | null;
  price_locked_at?: string | null;
  /** Customer confirmed worker-locked price (required before worker can start when price is locked). */
  price_confirmed_by_customer_at?: string | null;
  /** Optional worker note when locking (e.g. why rate or hours changed). */
  price_lock_note?: string | null;
  notes?: string;
  response_deadline_at?: string | null;
  payment_method?: 'card' | 'cash' | null;
  payment_status?: 'unpaid' | 'pending' | 'paid' | 'refunded' | null;
  /** Platform fee on cash jobs (charged to worker's card on platform Stripe account). */
  cash_platform_fee_cents?: number | null;
  cash_platform_fee_status?: 'pending' | 'charged' | 'failed' | null;
  cash_platform_fee_stripe_payment_intent_id?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface BookingRefundRequest {
  id: string;
  booking_id: string;
  customer_id: string;
  worker_id: string;
  reason?: string | null;
  status: 'requested' | 'worker_confirmed' | 'processing' | 'succeeded' | 'failed' | 'rejected' | 'expired';
  requested_at: string;
  worker_confirmed_at?: string | null;
  processed_at?: string | null;
  stripe_refund_id?: string | null;
  stripe_refund_status?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  worker_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export interface BookingPhoto {
  id: string;
  booking_id: string;
  photo_url: string;
  uploaded_by: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  worker_id: string;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

// Supabase Database Types (public.Enums required by supabase-js for table inference)
export interface Database {
  public: {
    Enums: Record<string, string>;
    Tables: {
      users: {
        Row: User;
        Insert: {
          id: string;
          user_type: UserType;
          full_name: string;
          email: string;
          phone?: string;
          avatar_url?: string;
        };
        Update: Partial<Omit<User, 'id' | 'created_at'>>;
      };
      worker_profiles: {
        Row: WorkerProfile;
        Insert: {
          id?: string;
          user_id: string;
          bio?: string;
          experience_years?: number;
          rating_average?: number;
          total_jobs_completed?: number;
          is_available?: boolean;
          latitude?: number;
          longitude?: number;
          phone?: string | null;
          phone_verified_at?: string | null;
          id_document_url?: string | null;
          id_uploaded_at?: string | null;
        };
        Update: Partial<Omit<WorkerProfile, 'id'>>;
      };
      worker_portfolio_photos: {
        Row: WorkerPortfolioPhoto;
        Insert: {
          id?: string;
          worker_id: string;
          photo_url: string;
          sort_order?: number;
        };
        Update: Partial<Omit<WorkerPortfolioPhoto, 'id' | 'worker_id' | 'created_at'>>;
      };
      services: {
        Row: Service;
        Insert: {
          id?: string;
          name: string;
          description?: string;
          icon_name?: string;
          base_price: number;
          is_active?: boolean;
        };
        Update: Partial<Omit<Service, 'id'>>;
      };
      service_subscriptions: {
        Row: ServiceSubscription;
        Insert: {
          id?: string;
          worker_id: string;
          service_id: string;
          custom_price?: number;
        };
        Update: Partial<Omit<ServiceSubscription, 'id'>>;
      };
      bookings: {
        Row: Booking;
        Insert: {
          id?: string;
          customer_id: string;
          worker_id?: string;
          service_id: string;
          status: BookingStatus;
          scheduled_date: string;
          address: string;
          latitude?: number;
          longitude?: number;
          price: number;
          notes?: string;
        };
        Update: Partial<Omit<Booking, 'id' | 'created_at'>>;
      };
      reviews: {
        Row: Review;
        Insert: {
          id?: string;
          booking_id: string;
          customer_id: string;
          worker_id: string;
          rating: number;
          comment?: string;
        };
        Update: Partial<Omit<Review, 'id' | 'created_at'>>;
      };
      booking_refund_requests: {
        Row: BookingRefundRequest;
        Insert: {
          id?: string;
          booking_id: string;
          customer_id: string;
          worker_id: string;
          reason?: string | null;
          status?: BookingRefundRequest['status'];
          requested_at?: string;
          worker_confirmed_at?: string | null;
          processed_at?: string | null;
          stripe_refund_id?: string | null;
          stripe_refund_status?: string | null;
          error_message?: string | null;
        };
        Update: Partial<Omit<BookingRefundRequest, 'id' | 'created_at' | 'booking_id' | 'customer_id'>>;
      };
      booking_photos: {
        Row: BookingPhoto;
        Insert: {
          id?: string;
          booking_id: string;
          photo_url: string;
          uploaded_by: string;
        };
        Update: Partial<Omit<BookingPhoto, 'id' | 'created_at'>>;
      };
      conversations: {
        Row: Conversation;
        Insert: {
          id?: string;
          customer_id: string;
          worker_id: string;
          booking_id?: string | null;
        };
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>;
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          read_at?: string | null;
        };
        Update: Partial<Omit<Message, 'id' | 'created_at'>>;
      };
      push_tokens: {
        Row: PushToken;
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform: string;
          updated_at: string;
        };
        Update: Partial<Omit<PushToken, 'id' | 'created_at'>>;
      };
    };
  };
}
