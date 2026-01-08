import { UserType, BookingStatus } from './enums';

export interface User {
  id: string;
  user_type: UserType;
  full_name: string;
  phone: string;
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
  notes?: string;
  created_at: string;
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

// Supabase Database Types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: {
          id: string;
          user_type: UserType;
          full_name: string;
          phone: string;
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
    };
  };
}
