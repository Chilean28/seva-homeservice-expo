-- Enable Row Level Security on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_portfolio_photos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- USERS TABLE POLICIES
-- ============================================

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can insert own profile"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- See database/users-rls-tighten.sql — replaced blanket public read with self / workers / booking parties.
CREATE POLICY "Users readable for self workers or booking parties"
  ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.worker_profiles wp WHERE wp.user_id = users.id)
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      INNER JOIN public.worker_profiles wp ON wp.id = b.worker_id
      WHERE b.customer_id = auth.uid()
        AND wp.user_id = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.customer_id = users.id
        AND b.worker_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.worker_profiles wp
          WHERE wp.id = b.worker_id AND wp.user_id = auth.uid()
        )
    )
    OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.customer_id = users.id)
  );

-- ============================================
-- WORKER PROFILES TABLE POLICIES
-- ============================================

-- Anyone can read worker profiles
CREATE POLICY "Anyone can read worker profiles"
  ON public.worker_profiles
  FOR SELECT
  USING (true);

-- Workers can update their own profile
CREATE POLICY "Workers can update own profile"
  ON public.worker_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.user_type = 'worker'
      AND users.id = worker_profiles.user_id
    )
  );

-- Workers can insert their own profile
CREATE POLICY "Workers can insert own profile"
  ON public.worker_profiles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.user_type = 'worker'
      AND users.id = worker_profiles.user_id
    )
  );

-- ============================================
-- SERVICES TABLE POLICIES
-- ============================================

-- Anyone can read active services
CREATE POLICY "Anyone can read active services"
  ON public.services
  FOR SELECT
  USING (is_active = true);

-- Only authenticated users can read all services (including inactive)
CREATE POLICY "Authenticated users can read all services"
  ON public.services
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- SERVICE SUBSCRIPTIONS TABLE POLICIES
-- ============================================

-- Anyone can read service subscriptions
CREATE POLICY "Anyone can read service subscriptions"
  ON public.service_subscriptions
  FOR SELECT
  USING (true);

-- Workers can manage their own service subscriptions
CREATE POLICY "Workers can manage own subscriptions"
  ON public.service_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = service_subscriptions.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- ============================================
-- BOOKINGS TABLE POLICIES
-- ============================================

-- Customers can read their own bookings
CREATE POLICY "Customers can read own bookings"
  ON public.bookings
  FOR SELECT
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.user_type = 'customer'
      AND bookings.customer_id = users.id
    )
  );

-- Workers can read bookings assigned to them
CREATE POLICY "Workers can read assigned bookings"
  ON public.bookings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = bookings.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- Workers can read unassigned pending bookings within 10 km (see database/bookings-pending-pool-geo-rls.sql).
-- Assigned pending bookings are visible via "Workers can read assigned bookings".
CREATE POLICY "Workers can read unassigned pending bookings nearby"
  ON public.bookings
  FOR SELECT
  USING (
    status = 'pending'
    AND worker_id IS NULL
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users u
      INNER JOIN public.worker_profiles wp ON wp.user_id = u.id
      WHERE u.id = auth.uid()
        AND u.user_type = 'worker'
        AND wp.latitude IS NOT NULL
        AND wp.longitude IS NOT NULL
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography,
          ST_SetSRID(ST_MakePoint(wp.longitude::double precision, wp.latitude::double precision), 4326)::geography,
          10000
        )
    )
  );

-- Customers can create bookings
CREATE POLICY "Customers can create bookings"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.user_type = 'customer'
      AND bookings.customer_id = users.id
    )
  );

-- Customers can update their own bookings (cancel, etc.)
CREATE POLICY "Customers can update own bookings"
  ON public.bookings
  FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Workers can accept/update bookings assigned to them
CREATE POLICY "Workers can update assigned bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = bookings.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- Workers can accept pending bookings
CREATE POLICY "Workers can accept pending bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.user_id = auth.uid()
      AND worker_profiles.is_available = true
    )
  )
  WITH CHECK (
    status = 'accepted'
    AND EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = bookings.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- ============================================
-- REVIEWS TABLE POLICIES
-- ============================================

-- Anyone can read reviews
CREATE POLICY "Anyone can read reviews"
  ON public.reviews
  FOR SELECT
  USING (true);

-- Customers can create reviews for their bookings
CREATE POLICY "Customers can create reviews"
  ON public.reviews
  FOR INSERT
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = reviews.booking_id
      AND bookings.customer_id = auth.uid()
      AND bookings.status = 'completed'
    )
  );

-- Customers can update their own reviews
CREATE POLICY "Customers can update own reviews"
  ON public.reviews
  FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- ============================================
-- BOOKING PHOTOS TABLE POLICIES
-- ============================================

-- Anyone can read booking photos
CREATE POLICY "Anyone can read booking photos"
  ON public.booking_photos
  FOR SELECT
  USING (true);

-- Customers and workers can upload photos for their bookings
CREATE POLICY "Users can upload booking photos"
  ON public.booking_photos
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = booking_photos.booking_id
      AND (
        bookings.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.worker_profiles
          WHERE worker_profiles.id = bookings.worker_id
          AND worker_profiles.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- WORKER PORTFOLIO PHOTOS TABLE POLICIES
-- ============================================

-- Anyone can read portfolio photos (for public worker profile)
CREATE POLICY "Anyone can read worker portfolio photos"
  ON public.worker_portfolio_photos
  FOR SELECT
  USING (true);

-- Workers can insert their own portfolio photos
CREATE POLICY "Workers can insert own portfolio photos"
  ON public.worker_portfolio_photos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = worker_portfolio_photos.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );

-- Workers can delete their own portfolio photos
CREATE POLICY "Workers can delete own portfolio photos"
  ON public.worker_portfolio_photos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.worker_profiles
      WHERE worker_profiles.id = worker_portfolio_photos.worker_id
      AND worker_profiles.user_id = auth.uid()
    )
  );
