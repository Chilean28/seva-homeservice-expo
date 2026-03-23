-- Customer saved addresses (Grab-style preset addresses)
CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  area_name TEXT,
  location_link TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customer_addresses_customer_id ON public.customer_addresses(customer_id);

-- RLS
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Customers can only see and manage their own addresses
CREATE POLICY "Customers can read own addresses"
  ON public.customer_addresses
  FOR SELECT
  USING (auth.uid() = customer_id);

CREATE POLICY "Customers can insert own addresses"
  ON public.customer_addresses
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Customers can update own addresses"
  ON public.customer_addresses
  FOR UPDATE
  USING (auth.uid() = customer_id);

CREATE POLICY "Customers can delete own addresses"
  ON public.customer_addresses
  FOR DELETE
  USING (auth.uid() = customer_id);
