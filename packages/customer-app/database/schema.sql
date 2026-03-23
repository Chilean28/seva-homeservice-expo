-- Enable PostGIS extension for location-based queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create enum types
CREATE TYPE user_type AS ENUM ('customer', 'worker');
CREATE TYPE booking_status AS ENUM ('pending', 'accepted', 'ongoing', 'completed', 'cancelled');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type user_type NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Worker profiles table
CREATE TABLE public.worker_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bio TEXT,
  experience_years INTEGER DEFAULT 0,
  rating_average DECIMAL(3, 2) DEFAULT 0.00 CHECK (rating_average >= 0 AND rating_average <= 5),
  total_jobs_completed INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_name TEXT,
  base_price DECIMAL(10, 2) NOT NULL CHECK (base_price >= 0),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Service subscriptions table (worker-service relationships)
CREATE TABLE public.service_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_price DECIMAL(10, 2) CHECK (custom_price >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(worker_id, service_id)
);

-- Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES public.worker_profiles(id) ON DELETE SET NULL,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  status booking_status NOT NULL DEFAULT 'pending',
  scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(booking_id)
);

-- Booking photos table
CREATE TABLE public.booking_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_worker_profiles_user_id ON public.worker_profiles(user_id);
CREATE INDEX idx_worker_profiles_location ON public.worker_profiles USING GIST(ST_MakePoint(longitude, latitude));
CREATE INDEX idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX idx_bookings_worker_id ON public.bookings(worker_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_bookings_scheduled_date ON public.bookings(scheduled_date);
CREATE INDEX idx_service_subscriptions_worker_id ON public.service_subscriptions(worker_id);
CREATE INDEX idx_service_subscriptions_service_id ON public.service_subscriptions(service_id);
CREATE INDEX idx_reviews_worker_id ON public.reviews(worker_id);
CREATE INDEX idx_reviews_booking_id ON public.reviews(booking_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_worker_profiles_updated_at
  BEFORE UPDATE ON public.worker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
