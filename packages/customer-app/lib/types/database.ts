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
  /** Hours assumed at booking (minimum block, default 2). */
  estimated_duration_hours?: number;
  /** Total $ at booking estimate (before worker lock). */
  estimated_total?: number | null;
  /** Final billable hours when worker locked price. */
  locked_duration_hours?: number | null;
  /** Locked hourly rate at job lock; if omitted when locked, same as `price`. */
  locked_hourly_rate?: number | null;
  /** When worker locked the final price. */
  price_locked_at?: string | null;
  /** Optional worker note when locking. */
  price_lock_note?: string | null;
  /** When the customer confirmed the locked final price. */
  price_confirmed_by_customer_at?: string | null;
  notes?: string;
  payment_method?: 'card' | 'cash';
  payment_status?: 'unpaid' | 'pending' | 'paid' | 'refunded';
  stripe_payment_intent_id?: string | null;
  stripe_payment_method_id?: string | null;
  cash_platform_fee_cents?: number | null;
  cash_platform_fee_status?: 'pending' | 'charged' | 'failed' | null;
  cash_platform_fee_stripe_payment_intent_id?: string | null;
  response_deadline_at?: string | null;
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

export interface CustomerAddress {
  id: string;
  customer_id: string;
  label: string;
  address: string;
  area_name?: string | null;
  location_link?: string | null;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  expo_push_token: string;
  platform: string;
  created_at: string;
  updated_at: string;
}

// Supabase Database Types
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
        };
        Update: Partial<Omit<WorkerProfile, 'id'>>;
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
          estimated_duration_hours?: number;
          estimated_total?: number | null;
          total_amount?: number | null;
          notes?: string;
          payment_method?: 'card' | 'cash';
          payment_status?: 'unpaid' | 'pending' | 'paid' | 'refunded';
          stripe_payment_intent_id?: string | null;
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
      customer_addresses: {
        Row: CustomerAddress;
        Insert: {
          id?: string;
          customer_id: string;
          label: string;
          address: string;
          area_name?: string | null;
          location_link?: string | null;
          latitude?: number;
          longitude?: number;
          is_default?: boolean;
        };
        Update: Partial<Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at'>>;
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
