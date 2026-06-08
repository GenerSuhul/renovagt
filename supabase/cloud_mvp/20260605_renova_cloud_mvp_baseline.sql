-- RENOVA ecommerce Cloud MVP baseline.
-- Fresh-project baseline for Supabase Cloud free tier: lean schema, bulk SAP ingestion,
-- checkout reservations, admin RLS, and media buckets.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_slugify(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(unaccent(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_text(p_row JSONB, keys TEXT[], fallback TEXT DEFAULT '')
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key TEXT;
  value TEXT;
BEGIN
  FOREACH key IN ARRAY keys LOOP
    value := NULLIF(trim(both from p_row->>key), '');
    IF value IS NOT NULL THEN
      RETURN value;
    END IF;
  END LOOP;
  RETURN fallback;
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_number(p_row JSONB, keys TEXT[], fallback NUMERIC DEFAULT 0)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key TEXT;
  value TEXT;
BEGIN
  FOREACH key IN ARRAY keys LOOP
    value := NULLIF(trim(both from p_row->>key), '');
    IF value IS NOT NULL THEN
      BEGIN
        RETURN value::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;
  RETURN fallback;
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_bool(p_row JSONB, keys TEXT[], fallback BOOLEAN DEFAULT true)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key TEXT;
  value TEXT;
BEGIN
  FOREACH key IN ARRAY keys LOOP
    value := lower(NULLIF(trim(both from p_row->>key), ''));
    IF value IN ('true', '1', 'y', 'yes', 'active', 'activo') THEN
      RETURN true;
    ELSIF value IN ('false', '0', 'n', 'no', 'inactive', 'inactivo') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN fallback;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = check_user_id
      AND ur.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = check_user_id
      AND p.role IN ('admin', 'super_admin')
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = check_user_id AND ur.role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_user_id AND p.role = 'super_admin' AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'customer',
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code),
  UNIQUE(slug)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  image TEXT,
  sap_group_code INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code),
  UNIQUE(slug)
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  item_code TEXT,
  sap_item_code TEXT,
  sku TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  original_price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'GTQ',
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  short_description TEXT,
  specs JSONB NOT NULL DEFAULT '[]'::jsonb,
  labels TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  barcode TEXT,
  weight_kg NUMERIC(12,3) NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipping_class TEXT NOT NULL DEFAULT 'standard',
  safety_stock_default NUMERIC(12,3) NOT NULL DEFAULT 0,
  sap_sync_status TEXT NOT NULL DEFAULT 'pending',
  sap_last_sync_at TIMESTAMPTZ,
  sap_raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ecommerce_status TEXT NOT NULL DEFAULT 'needs_enrichment',
  enrichment_status TEXT NOT NULL DEFAULT 'needs_enrichment',
  enrichment_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sku),
  UNIQUE(slug),
  UNIQUE(sap_item_code),
  UNIQUE(item_code)
);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  image_url TEXT,
  storage_path TEXT,
  alt TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.category_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  sap_warehouse_code TEXT UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  hours TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_warehouse_code TEXT NOT NULL UNIQUE,
  branch_code TEXT,
  name TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_by_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL,
  warehouse_code TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  branch_code TEXT,
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  committed NUMERIC(14,3) NOT NULL DEFAULT 0,
  available NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_ecommerce NUMERIC(14,3) NOT NULL DEFAULT 0,
  safety_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  available_ecommerce NUMERIC(14,3) GENERATED ALWAYS AS (GREATEST(on_hand - committed - reserved_ecommerce - safety_stock, 0)) STORED,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  idempotency_key TEXT,
  last_sap_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_code, warehouse_code)
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  committed NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_ecommerce NUMERIC(14,3) NOT NULL DEFAULT 0,
  safety_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  available_ecommerce NUMERIC(14,3) GENERATED ALWAYS AS (GREATEST(on_hand - committed - reserved_ecommerce - safety_stock, 0)) STORED,
  last_sap_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, store_id)
);

CREATE TABLE IF NOT EXISTS public.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'all',
  currency TEXT NOT NULL DEFAULT 'GTQ',
  status TEXT NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL,
  price_list_code TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  price_list_id UUID REFERENCES public.price_lists(id) ON DELETE SET NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GTQ',
  min_qty INTEGER NOT NULL DEFAULT 1,
  customer_type TEXT NOT NULL DEFAULT 'all',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  correlation_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_code, price_list_code)
);

CREATE TABLE IF NOT EXISTS public.admin_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'all',
  currency TEXT NOT NULL DEFAULT 'GTQ',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID REFERENCES public.admin_price_lists(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(price_list_id, product_id, min_qty)
);

CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'delivery',
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  free_from NUMERIC(12,2),
  estimated_days TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'GTQ',
  supports_installments BOOLEAN NOT NULL DEFAULT false,
  public_key TEXT,
  webhook_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.ecommerce_payment_gateways AS
SELECT
  id, code, name, provider, environment, status, currency,
  supports_installments, webhook_url, created_at, updated_at
FROM public.payment_gateways
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.product_shipping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  shipping_method_id UUID REFERENCES public.shipping_methods(id) ON DELETE CASCADE,
  requires_quote BOOLEAN NOT NULL DEFAULT false,
  max_qty_per_order INTEGER,
  notes TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL DEFAULT ('RNV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(left(gen_random_uuid()::TEXT, 6))),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  fulfillment TEXT NOT NULL DEFAULT 'delivery',
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  shipping_address JSONB,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency TEXT NOT NULL DEFAULT 'GTQ',
  reservation_expires_at TIMESTAMPTZ,
  payment_confirmed_at TIMESTAMPTZ,
  ready_for_sap_at TIMESTAMPTZ,
  sap_sync_status TEXT NOT NULL DEFAULT 'pending',
  sap_synced_at TIMESTAMPTZ,
  sap_doc_entry INTEGER,
  sap_doc_num TEXT,
  sap_invoice_doc_entry INTEGER,
  sap_invoice_doc_num TEXT,
  fiscal_number TEXT,
  recovery_status TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_number)
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  image TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  warehouse_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'reserved',
  expires_at TIMESTAMPTZ,
  reservation_key TEXT,
  source TEXT NOT NULL DEFAULT 'checkout',
  confirmed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GTQ',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider TEXT,
  provider_event_id TEXT,
  idempotency_key TEXT,
  amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'GTQ',
  status TEXT NOT NULL DEFAULT 'received',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number TEXT,
  fiscal_number TEXT,
  sap_doc_entry INTEGER UNIQUE,
  sap_doc_num TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GTQ',
  pdf_url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  actor_id UUID,
  status TEXT NOT NULL DEFAULT 'processing',
  request_hash TEXT,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.integration_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT,
  aggregate_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ,
  correlation_id TEXT,
  idempotency_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  payload_count INTEGER,
  expected_rows INTEGER,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'received',
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS sap_events_idempotency_active_key
  ON public.sap_events (idempotency_key)
  WHERE status NOT IN ('expired', 'failed');

CREATE TABLE IF NOT EXISTS public.sap_entity_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  sap_object_type TEXT NOT NULL,
  sap_doc_entry INTEGER,
  sap_doc_num TEXT,
  sap_code TEXT,
  idempotency_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, sap_object_type)
);

CREATE TABLE IF NOT EXISTS public.sap_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'info',
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.sap_sync_log AS
SELECT * FROM public.sap_sync_logs;

CREATE TABLE IF NOT EXISTS public.error_recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  scope TEXT,
  task_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  idempotency_key TEXT,
  correlation_id TEXT,
  title TEXT,
  error TEXT,
  error_message TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sap_business_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  sap_card_code TEXT NOT NULL UNIQUE,
  card_name TEXT,
  legal_name TEXT,
  customer_type TEXT NOT NULL DEFAULT 'B2C',
  nit TEXT,
  email TEXT,
  phone TEXT,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_list TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sap_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sap_business_partner_id UUID REFERENCES public.sap_business_partners(id) ON DELETE SET NULL,
  customer_type TEXT NOT NULL DEFAULT 'B2C',
  full_name TEXT,
  email TEXT,
  phone TEXT,
  nit TEXT,
  price_list TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_image TEXT,
  product_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotional_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  desktop_image_url TEXT,
  mobile_image_url TEXT,
  target_url TEXT,
  placement TEXT NOT NULL DEFAULT 'home_slider',
  sort_order INTEGER NOT NULL DEFAULT 0,
  text_align TEXT NOT NULL DEFAULT 'left',
  text_theme TEXT NOT NULL DEFAULT 'light',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  origin_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  carrier TEXT NOT NULL DEFAULT 'FORZA',
  tracking_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  cost NUMERIC(12,2),
  weight_kg NUMERIC(12,3),
  volumetric_weight NUMERIC(12,3),
  package_count INTEGER NOT NULL DEFAULT 1,
  destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  channel TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'homepage_banner',
  status TEXT NOT NULL DEFAULT 'draft',
  target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget NUMERIC(12,2),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_order_total NUMERIC(12,2),
  usage_limit INTEGER,
  target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  event_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value)
VALUES
  ('orders_ready_for_sap_enabled', '{"enabled": false}'::jsonb),
  ('invoice_create_requested_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.gate_sap_integration_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  enabled BOOLEAN := false;
BEGIN
  IF NEW.event_type = 'orders.ready_for_sap' THEN
    SELECT COALESCE((value->>'enabled')::BOOLEAN, false)
    INTO enabled
    FROM public.system_settings
    WHERE key = 'orders_ready_for_sap_enabled';
    IF NOT enabled THEN
      NEW.payload := NEW.payload || jsonb_build_object('original_event_type', NEW.event_type, 'blocked_reason', 'orders_ready_for_sap_enabled=false');
      NEW.event_type := 'orders.sap_gate_blocked';
      NEW.status := 'blocked';
    END IF;
  ELSIF NEW.event_type = 'invoice.create_requested' THEN
    SELECT COALESCE((value->>'enabled')::BOOLEAN, false)
    INTO enabled
    FROM public.system_settings
    WHERE key = 'invoice_create_requested_enabled';
    IF NOT enabled THEN
      NEW.payload := NEW.payload || jsonb_build_object('original_event_type', NEW.event_type, 'blocked_reason', 'invoice_create_requested_enabled=false');
      NEW.event_type := 'invoice.sap_gate_blocked';
      NEW.status := 'blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gate_sap_integration_events ON public.integration_event_queue;
CREATE TRIGGER trg_gate_sap_integration_events
  BEFORE INSERT ON public.integration_event_queue
  FOR EACH ROW EXECUTE FUNCTION public.gate_sap_integration_events();

CREATE OR REPLACE FUNCTION public.sap_reclaim_stuck_sap_event(
  p_idempotency_key TEXT,
  p_stuck_after_seconds INTEGER DEFAULT 900
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.sap_events
  SET status = 'expired',
      processing_error = 'Expired stuck SAP event before retry',
      processed_at = now()
  WHERE idempotency_key = p_idempotency_key
    AND status IN ('received', 'processing')
    AND received_at < now() - make_interval(secs => GREATEST(p_stuck_after_seconds, 60))
    AND processed_rows = 0
    AND failed_rows = 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_backfill_product_prices(p_item_codes TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_admin_items INTEGER := 0;
BEGIN
  UPDATE public.product_prices pp
  SET product_id = p.id,
      price_list_id = pl.id,
      updated_at = now()
  FROM public.products p, public.price_lists pl
  WHERE (p.sap_item_code = pp.item_code OR p.item_code = pp.item_code OR p.sku = pp.item_code)
    AND pl.code = pp.price_list_code
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes));
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.products p
  SET price = pp.price,
      currency = pp.currency,
      updated_at = now()
  FROM public.product_prices pp
  WHERE pp.product_id = p.id
    AND pp.price_list_code IN ('1', 'B2C-GENERAL', 'PUBLICO', 'PUBLIC')
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes));

  INSERT INTO public.admin_price_list_items (price_list_id, product_id, price, min_qty)
  SELECT apl.id, pp.product_id, pp.price, pp.min_qty
  FROM public.product_prices pp
  JOIN public.admin_price_lists apl ON apl.code = pp.price_list_code
  WHERE pp.product_id IS NOT NULL
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
  ON CONFLICT (price_list_id, product_id, min_qty) DO UPDATE
  SET price = EXCLUDED.price,
      updated_at = now();
  GET DIAGNOSTICS v_admin_items = ROW_COUNT;

  RETURN jsonb_build_object('updated', v_updated, 'admin_items', v_admin_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_backfill_inventory_by_store(
  p_item_codes TEXT[] DEFAULT NULL,
  p_warehouse_codes TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
  v_inventory INTEGER := 0;
BEGIN
  UPDATE public.inventory_by_store ibs
  SET product_id = p.id,
      warehouse_id = w.id,
      store_id = w.store_id,
      updated_at = now()
  FROM public.products p, public.warehouses w
  WHERE ibs.item_code IN (p.sap_item_code, p.item_code, p.sku)
    AND ibs.warehouse_code = w.sap_warehouse_code
    AND (p_item_codes IS NULL OR ibs.item_code = ANY(p_item_codes))
    AND (p_warehouse_codes IS NULL OR ibs.warehouse_code = ANY(p_warehouse_codes));
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.inventory (
    product_id, store_id, qty, on_hand, committed, reserved_ecommerce, safety_stock, last_sap_sync_at
  )
  SELECT
    product_id,
    store_id,
    on_hand,
    on_hand,
    committed,
    0,
    safety_stock,
    last_sap_sync_at
  FROM public.inventory_by_store
  WHERE product_id IS NOT NULL
    AND store_id IS NOT NULL
    AND (p_item_codes IS NULL OR item_code = ANY(p_item_codes))
    AND (p_warehouse_codes IS NULL OR warehouse_code = ANY(p_warehouse_codes))
  ON CONFLICT (product_id, store_id) DO UPDATE
  SET qty = EXCLUDED.qty,
      on_hand = EXCLUDED.on_hand,
      committed = EXCLUDED.committed,
      safety_stock = EXCLUDED.safety_stock,
      last_sap_sync_at = EXCLUDED.last_sap_sync_at,
      updated_at = now();
  GET DIAGNOSTICS v_inventory = ROW_COUNT;

  RETURN jsonb_build_object('mapped_rows', v_updated, 'inventory_rows', v_inventory);
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_bulk_upsert_products(
  p_rows JSONB,
  p_correlation_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received INTEGER := 0;
  v_processed INTEGER := 0;
  v_skipped INTEGER := 0;
  v_item_codes TEXT[];
  v_sample_errors JSONB := '[]'::jsonb;
  v_price_backfill JSONB := '{}'::jsonb;
  v_inventory_backfill JSONB := '{}'::jsonb;
BEGIN
  DROP TABLE IF EXISTS _sap_product_rows;
  CREATE TEMP TABLE _sap_product_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    public.sap_jsonb_text(value, ARRAY['item_code', 'ItemCode', 'sku', 'SKU']) AS item_code,
    public.sap_jsonb_text(value, ARRAY['item_name', 'ItemName', 'name', 'Name']) AS item_name,
    public.sap_jsonb_text(value, ARRAY['brand', 'Brand', 'brand_code', 'BrandCode'], 'Sin marca') AS brand_code,
    public.sap_jsonb_text(value, ARRAY['category_code', 'ItemsGroupCode', 'items_group_code', 'category'], 'SIN-CATEGORIA') AS category_code,
    public.sap_jsonb_text(value, ARRAY['category_name', 'ItemsGroupName', 'items_group_name'], 'Sin categoria') AS category_name
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_product_rows;

  DROP TABLE IF EXISTS _sap_product_valid;
  CREATE TEMP TABLE _sap_product_valid ON COMMIT DROP AS
  SELECT * FROM _sap_product_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_product_invalid;
  CREATE TEMP TABLE _sap_product_invalid ON COMMIT DROP AS
  SELECT * FROM _sap_product_rows
  WHERE NOT (NULLIF(item_code, '') IS NOT NULL AND lower(item_code) NOT IN (',', 'null', 'undefined'));

  DROP TABLE IF EXISTS _sap_product_upsert;
  CREATE TEMP TABLE _sap_product_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code) * FROM _sap_product_valid ORDER BY item_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_product_valid;
  SELECT count(*) INTO v_skipped FROM _sap_product_invalid;

  INSERT INTO public.brands (code, name, slug, is_active)
  SELECT DISTINCT brand_code, brand_code, 'sap-' || COALESCE(NULLIF(public.sap_slugify(brand_code), ''), 'brand'), true
  FROM _sap_product_upsert
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      updated_at = now();

  INSERT INTO public.categories (code, slug, name, sap_group_code, is_active)
  SELECT DISTINCT
    category_code,
    'sap-' || COALESCE(NULLIF(public.sap_slugify(category_code), ''), 'category'),
    category_name,
    CASE WHEN category_code ~ '^[0-9]+$' THEN category_code::INTEGER ELSE NULL END,
    true
  FROM _sap_product_upsert
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      sap_group_code = COALESCE(EXCLUDED.sap_group_code, public.categories.sap_group_code),
      updated_at = now();

  INSERT INTO public.products (
    external_id, item_code, sap_item_code, sku, slug, name, brand_id, category_id,
    price, currency, image, images, description, short_description, specs, labels,
    is_active, barcode, weight_kg, shipping_class, sap_sync_status, sap_last_sync_at,
    sap_raw_payload, ecommerce_status, enrichment_status, enrichment_required
  )
  SELECT
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['external_id', 'ExternalId'], ''), ''), 'SAP-ITEM:' || v.item_code),
    v.item_code,
    v.item_code,
    v.item_code,
    COALESCE(NULLIF(public.sap_slugify(COALESCE(NULLIF(v.item_name, ''), v.item_code)), ''), 'producto') || '-' || COALESCE(NULLIF(public.sap_slugify(v.item_code), ''), left(md5(v.item_code), 8)),
    COALESCE(NULLIF(v.item_name, ''), v.item_code),
    b.id,
    c.id,
    GREATEST(public.sap_jsonb_number(v.row, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2),
    CASE WHEN public.sap_jsonb_text(v.row, ARRAY['currency', 'Currency'], 'GTQ') = 'QTZ' THEN 'GTQ' ELSE public.sap_jsonb_text(v.row, ARRAY['currency', 'Currency'], 'GTQ') END,
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['image', 'Image', 'image_url'], ''), ''), 'https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png'),
    '[]'::jsonb,
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['description', 'Description'], ''), ''), COALESCE(NULLIF(v.item_name, ''), v.item_code)),
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['short_description', 'ShortDescription'], ''), ''),
    '[]'::jsonb,
    '{}'::TEXT[],
    public.sap_jsonb_bool(v.row, ARRAY['is_active', 'Active', 'valid'], true),
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['barcode', 'BarCode', 'CodeBars'], ''), ''),
    GREATEST(public.sap_jsonb_number(v.row, ARRAY['weight_kg', 'WeightKg', 'SalesUnitWeight'], 0), 0),
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['shipping_class', 'ShippingClass'], 'standard'), ''), 'standard'),
    'synced',
    now(),
    v.row,
    'needs_enrichment',
    'needs_enrichment',
    true
  FROM _sap_product_upsert v
  LEFT JOIN public.brands b ON b.code = v.brand_code
  LEFT JOIN public.categories c ON c.code = v.category_code
  ON CONFLICT (sap_item_code) DO UPDATE
  SET external_id = EXCLUDED.external_id,
      item_code = EXCLUDED.item_code,
      sku = EXCLUDED.sku,
      name = EXCLUDED.name,
      brand_id = EXCLUDED.brand_id,
      category_id = EXCLUDED.category_id,
      barcode = EXCLUDED.barcode,
      currency = EXCLUDED.currency,
      description = EXCLUDED.description,
      short_description = EXCLUDED.short_description,
      weight_kg = EXCLUDED.weight_kg,
      shipping_class = EXCLUDED.shipping_class,
      sap_sync_status = 'synced',
      sap_last_sync_at = now(),
      sap_raw_payload = EXCLUDED.sap_raw_payload,
      is_active = EXCLUDED.is_active,
      updated_at = now();

  INSERT INTO public.product_variants (product_id, sku, barcode, name, attributes, price, price_delta, is_active)
  SELECT p.id, v.item_code, NULLIF(public.sap_jsonb_text(v.row, ARRAY['barcode', 'BarCode', 'CodeBars'], ''), ''),
         COALESCE(NULLIF(v.item_name, ''), v.item_code), '{}'::jsonb,
         GREATEST(public.sap_jsonb_number(v.row, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2), 0, true
  FROM _sap_product_upsert v
  JOIN public.products p ON p.sap_item_code = v.item_code
  ON CONFLICT (sku) DO UPDATE
  SET product_id = EXCLUDED.product_id,
      barcode = EXCLUDED.barcode,
      name = EXCLUDED.name,
      updated_at = now();

  IF v_skipped > 0 THEN
    INSERT INTO public.error_recovery_tasks (severity, status, task_type, entity_type, entity_id, idempotency_key, correlation_id, error_message, payload, title, error, request_payload)
    SELECT 'warning', 'open', 'sap_product_skipped', 'catalog.products.upsert', row_index::TEXT,
           p_idempotency_key, p_correlation_id, 'Skipped SAP product row: invalid item_code',
           jsonb_build_object('row_index', row_index, 'row', row), 'Producto SAP omitido', 'invalid_item_code', row
    FROM _sap_product_invalid;
  END IF;

  SELECT array_agg(item_code) INTO v_item_codes FROM _sap_product_upsert;
  IF v_item_codes IS NOT NULL THEN
    v_price_backfill := public.sap_backfill_product_prices(v_item_codes);
    v_inventory_backfill := public.sap_backfill_inventory_by_store(v_item_codes, NULL);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('ok', true, 'skipped', true, 'reason', 'invalid_item_code', 'index', row_index, 'error', 'Missing or invalid item_code') ORDER BY row_index), '[]'::jsonb)
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_product_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object('ok', true, 'received', v_received, 'processed', v_processed, 'skipped', v_skipped, 'failed', 0, 'sample_errors', v_sample_errors, 'results', jsonb_build_array(jsonb_build_object('ok', true, 'action', 'bulk_upsert_products', 'processed', v_processed, 'skipped', v_skipped, 'price_backfill', v_price_backfill, 'inventory_backfill', v_inventory_backfill)));
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_bulk_upsert_prices(
  p_rows JSONB,
  p_correlation_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received INTEGER := 0;
  v_processed INTEGER := 0;
  v_skipped INTEGER := 0;
  v_pending INTEGER := 0;
  v_backfill JSONB := '{}'::jsonb;
  v_item_codes TEXT[];
  v_sample_errors JSONB := '[]'::jsonb;
BEGIN
  DROP TABLE IF EXISTS _sap_price_rows;
  CREATE TEMP TABLE _sap_price_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    public.sap_jsonb_text(value, ARRAY['item_code', 'ItemCode', 'sku', 'SKU']) AS item_code,
    public.sap_jsonb_text(value, ARRAY['price_list', 'PriceList', 'price_list_code', 'PriceListCode'], '1') AS price_list_code,
    public.sap_jsonb_text(value, ARRAY['price_list_name', 'PriceListName'], '') AS price_list_name,
    CASE WHEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all')) IN ('b2b','b2c','all') THEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all')) ELSE 'all' END AS customer_type,
    GREATEST(public.sap_jsonb_number(value, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2) AS price,
    CASE WHEN public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ') = 'QTZ' THEN 'GTQ' ELSE public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ') END AS currency,
    GREATEST(public.sap_jsonb_number(value, ARRAY['min_qty', 'MinQty'], 1), 1)::INTEGER AS min_qty
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_price_rows;

  DROP TABLE IF EXISTS _sap_price_valid;
  CREATE TEMP TABLE _sap_price_valid ON COMMIT DROP AS
  SELECT * FROM _sap_price_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(price_list_code, '') IS NOT NULL
    AND lower(price_list_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_price_invalid;
  CREATE TEMP TABLE _sap_price_invalid ON COMMIT DROP AS
  SELECT * FROM _sap_price_rows
  WHERE NOT (NULLIF(item_code, '') IS NOT NULL AND lower(item_code) NOT IN (',', 'null', 'undefined') AND NULLIF(price_list_code, '') IS NOT NULL AND lower(price_list_code) NOT IN (',', 'null', 'undefined'));

  DROP TABLE IF EXISTS _sap_price_upsert;
  CREATE TEMP TABLE _sap_price_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code, price_list_code) * FROM _sap_price_valid ORDER BY item_code, price_list_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_price_valid;
  SELECT count(*) INTO v_skipped FROM _sap_price_invalid;

  INSERT INTO public.price_lists (code, name, customer_type, currency, status, is_active, source)
  SELECT DISTINCT price_list_code, COALESCE(NULLIF(price_list_name, ''), price_list_code), customer_type, currency, 'active', true, 'sap_b1_middleware'
  FROM _sap_price_upsert
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      status = 'active',
      is_active = true,
      updated_at = now();

  INSERT INTO public.admin_price_lists (code, name, customer_type, currency, is_active)
  SELECT DISTINCT price_list_code, COALESCE(NULLIF(price_list_name, ''), price_list_code), customer_type, currency, true
  FROM _sap_price_upsert
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      is_active = true,
      updated_at = now();

  INSERT INTO public.product_prices (item_code, price_list_code, product_id, price_list_id, price, currency, min_qty, customer_type, payload, correlation_id, idempotency_key)
  SELECT v.item_code, v.price_list_code, p.id, pl.id, v.price, v.currency, v.min_qty, v.customer_type, v.row, p_correlation_id, p_idempotency_key
  FROM _sap_price_upsert v
  LEFT JOIN public.products p ON p.sap_item_code = v.item_code OR p.item_code = v.item_code OR p.sku = v.item_code
  JOIN public.price_lists pl ON pl.code = v.price_list_code
  ON CONFLICT (item_code, price_list_code) DO UPDATE
  SET product_id = EXCLUDED.product_id,
      price_list_id = EXCLUDED.price_list_id,
      price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      min_qty = EXCLUDED.min_qty,
      customer_type = EXCLUDED.customer_type,
      payload = EXCLUDED.payload,
      correlation_id = EXCLUDED.correlation_id,
      idempotency_key = EXCLUDED.idempotency_key,
      updated_at = now();

  SELECT array_agg(DISTINCT item_code) INTO v_item_codes FROM _sap_price_upsert;
  v_backfill := public.sap_backfill_product_prices(v_item_codes);

  SELECT count(*) INTO v_pending
  FROM public.product_prices
  WHERE product_id IS NULL
    AND (v_item_codes IS NULL OR item_code = ANY(v_item_codes));

  IF v_skipped > 0 THEN
    INSERT INTO public.error_recovery_tasks (severity, status, task_type, entity_type, entity_id, idempotency_key, correlation_id, error_message, payload, title, error, request_payload)
    SELECT 'warning', 'open', 'sap_price_skipped', 'catalog.prices.upsert', row_index::TEXT,
           p_idempotency_key, p_correlation_id, 'Skipped SAP price row: invalid item_code or price_list',
           jsonb_build_object('row_index', row_index, 'row', row), 'Precio SAP omitido', 'invalid_price_key', row
    FROM _sap_price_invalid;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('ok', true, 'skipped', true, 'reason', 'invalid_price_key', 'index', row_index, 'error', 'Missing or invalid item_code or price_list') ORDER BY row_index), '[]'::jsonb)
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_price_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object('ok', true, 'received', v_received, 'processed', v_processed, 'skipped', v_skipped, 'failed', 0, 'pending', v_pending, 'sample_errors', v_sample_errors, 'results', jsonb_build_array(jsonb_build_object('ok', true, 'action', 'bulk_upsert_prices', 'processed', v_processed, 'skipped', v_skipped, 'pending', v_pending, 'backfill', v_backfill)));
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_bulk_upsert_inventory(
  p_rows JSONB,
  p_correlation_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received INTEGER := 0;
  v_processed INTEGER := 0;
  v_skipped INTEGER := 0;
  v_pending INTEGER := 0;
  v_backfill JSONB := '{}'::jsonb;
  v_item_codes TEXT[];
  v_warehouse_codes TEXT[];
  v_sample_errors JSONB := '[]'::jsonb;
BEGIN
  DROP TABLE IF EXISTS _sap_inventory_rows;
  CREATE TEMP TABLE _sap_inventory_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    public.sap_jsonb_text(value, ARRAY['item_code', 'ItemCode', 'sku', 'SKU']) AS item_code,
    public.sap_jsonb_text(value, ARRAY['warehouse_code', 'WarehouseCode', 'store_code', 'StoreCode']) AS warehouse_code,
    public.sap_jsonb_text(value, ARRAY['branch_code', 'BranchCode'], '') AS branch_code,
    public.sap_jsonb_text(value, ARRAY['warehouse_name', 'WarehouseName', 'store_name', 'StoreName'], '') AS warehouse_name,
    GREATEST(public.sap_jsonb_number(value, ARRAY['on_hand', 'OnHand', 'qty', 'Quantity'], 0), 0)::NUMERIC(14,3) AS on_hand,
    GREATEST(public.sap_jsonb_number(value, ARRAY['committed', 'Committed'], 0), 0)::NUMERIC(14,3) AS committed,
    GREATEST(public.sap_jsonb_number(value, ARRAY['available', 'Available'], 0), 0)::NUMERIC(14,3) AS available,
    GREATEST(public.sap_jsonb_number(value, ARRAY['reserved_ecommerce', 'ReservedEcommerce'], 0), 0)::NUMERIC(14,3) AS reserved_ecommerce,
    GREATEST(public.sap_jsonb_number(value, ARRAY['safety_stock', 'SafetyStock'], 0), 0)::NUMERIC(14,3) AS safety_stock
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_inventory_rows;

  DROP TABLE IF EXISTS _sap_inventory_valid;
  CREATE TEMP TABLE _sap_inventory_valid ON COMMIT DROP AS
  SELECT * FROM _sap_inventory_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(warehouse_code, '') IS NOT NULL
    AND lower(warehouse_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_inventory_invalid;
  CREATE TEMP TABLE _sap_inventory_invalid ON COMMIT DROP AS
  SELECT * FROM _sap_inventory_rows
  WHERE NOT (NULLIF(item_code, '') IS NOT NULL AND lower(item_code) NOT IN (',', 'null', 'undefined') AND NULLIF(warehouse_code, '') IS NOT NULL AND lower(warehouse_code) NOT IN (',', 'null', 'undefined'));

  DROP TABLE IF EXISTS _sap_inventory_upsert;
  CREATE TEMP TABLE _sap_inventory_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code, warehouse_code) * FROM _sap_inventory_valid ORDER BY item_code, warehouse_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_inventory_valid;
  SELECT count(*) INTO v_skipped FROM _sap_inventory_invalid;

  INSERT INTO public.stores (code, sap_warehouse_code, name, is_active)
  SELECT DISTINCT warehouse_code, warehouse_code, COALESCE(NULLIF(warehouse_name, ''), 'Bodega ' || warehouse_code), true
  FROM _sap_inventory_upsert
  ON CONFLICT (code) DO UPDATE
  SET sap_warehouse_code = EXCLUDED.sap_warehouse_code,
      name = EXCLUDED.name,
      is_active = true,
      updated_at = now();

  INSERT INTO public.warehouses (sap_warehouse_code, branch_code, name, store_id, is_active, payload)
  SELECT DISTINCT v.warehouse_code, NULLIF(v.branch_code, ''), COALESCE(NULLIF(v.warehouse_name, ''), 'Bodega ' || v.warehouse_code), s.id, true, jsonb_build_object('source', 'inventory.upsert')
  FROM _sap_inventory_upsert v
  JOIN public.stores s ON s.code = v.warehouse_code
  ON CONFLICT (sap_warehouse_code) DO UPDATE
  SET branch_code = COALESCE(EXCLUDED.branch_code, public.warehouses.branch_code),
      name = EXCLUDED.name,
      store_id = EXCLUDED.store_id,
      is_active = true,
      updated_at = now();

  INSERT INTO public.inventory_by_store (
    item_code, warehouse_code, product_id, warehouse_id, store_id, branch_code,
    on_hand, committed, available, reserved_ecommerce, safety_stock, payload,
    correlation_id, idempotency_key, last_sap_sync_at
  )
  SELECT
    v.item_code, v.warehouse_code, p.id, w.id, w.store_id, NULLIF(v.branch_code, ''),
    v.on_hand, v.committed,
    CASE WHEN v.available > 0 THEN v.available ELSE GREATEST(v.on_hand - v.committed - v.safety_stock, 0) END,
    0, v.safety_stock, v.row, p_correlation_id, p_idempotency_key, now()
  FROM _sap_inventory_upsert v
  LEFT JOIN public.products p ON p.sap_item_code = v.item_code OR p.item_code = v.item_code OR p.sku = v.item_code
  JOIN public.warehouses w ON w.sap_warehouse_code = v.warehouse_code
  ON CONFLICT (item_code, warehouse_code) DO UPDATE
  SET product_id = EXCLUDED.product_id,
      warehouse_id = EXCLUDED.warehouse_id,
      store_id = EXCLUDED.store_id,
      branch_code = EXCLUDED.branch_code,
      on_hand = EXCLUDED.on_hand,
      committed = EXCLUDED.committed,
      available = EXCLUDED.available,
      safety_stock = EXCLUDED.safety_stock,
      payload = EXCLUDED.payload,
      correlation_id = EXCLUDED.correlation_id,
      idempotency_key = EXCLUDED.idempotency_key,
      last_sap_sync_at = EXCLUDED.last_sap_sync_at,
      updated_at = now();

  SELECT array_agg(DISTINCT item_code) INTO v_item_codes FROM _sap_inventory_upsert;
  SELECT array_agg(DISTINCT warehouse_code) INTO v_warehouse_codes FROM _sap_inventory_upsert;
  v_backfill := public.sap_backfill_inventory_by_store(v_item_codes, v_warehouse_codes);

  SELECT count(*) INTO v_pending
  FROM public.inventory_by_store
  WHERE (product_id IS NULL OR store_id IS NULL)
    AND (v_item_codes IS NULL OR item_code = ANY(v_item_codes))
    AND (v_warehouse_codes IS NULL OR warehouse_code = ANY(v_warehouse_codes));

  IF v_skipped > 0 THEN
    INSERT INTO public.error_recovery_tasks (severity, status, task_type, entity_type, entity_id, idempotency_key, correlation_id, error_message, payload, title, error, request_payload)
    SELECT 'warning', 'open', 'sap_inventory_skipped', 'inventory.upsert', row_index::TEXT,
           p_idempotency_key, p_correlation_id, 'Skipped SAP inventory row: invalid item_code or warehouse_code',
           jsonb_build_object('row_index', row_index, 'row', row), 'Inventario SAP omitido', 'invalid_inventory_key', row
    FROM _sap_inventory_invalid;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('ok', true, 'skipped', true, 'reason', 'invalid_inventory_key', 'index', row_index, 'error', 'Missing or invalid item_code or warehouse_code') ORDER BY row_index), '[]'::jsonb)
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_inventory_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object('ok', true, 'received', v_received, 'processed', v_processed, 'skipped', v_skipped, 'failed', 0, 'pending', v_pending, 'sample_errors', v_sample_errors, 'results', jsonb_build_array(jsonb_build_object('ok', true, 'action', 'bulk_upsert_inventory', 'processed', v_processed, 'skipped', v_skipped, 'pending', v_pending, 'backfill', v_backfill)));
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_reservations(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'released'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT id, product_id, store_id, qty
    FROM public.inventory_reservations
    WHERE order_id = p_order_id
      AND status IN ('reserved', 'committed')
    FOR UPDATE
  LOOP
    UPDATE public.inventory
    SET reserved_ecommerce = GREATEST(reserved_ecommerce - r.qty, 0)
    WHERE product_id = r.product_id
      AND store_id = r.store_id;

    UPDATE public.inventory_reservations
    SET status = CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'released' END,
        released_at = now(),
        updated_at = now()
    WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_inventory_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT order_id
    FROM public.inventory_reservations
    WHERE status = 'reserved'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
      AND order_id IS NOT NULL
  LOOP
    v_count := v_count + public.release_order_reservations(r.order_id, 'expired');

    UPDATE public.orders
    SET status = CASE WHEN status IN ('pending_payment', 'pending_bank_transfer', 'pending_store_payment', 'pending') THEN 'expired' ELSE status END,
        payment_status = CASE WHEN payment_status = 'pending' THEN 'expired' ELSE payment_status END,
        updated_at = now()
    WHERE id = r.order_id;

    INSERT INTO public.order_status_history (order_id, status, notes)
    VALUES (r.order_id, 'reservation_expired', 'Reserva ecommerce liberada por expiracion');
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_create_order(
  p_user_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID := gen_random_uuid();
  v_order_number TEXT;
  v_lines JSONB := COALESCE(p_payload->'lines', '[]'::jsonb);
  v_line JSONB;
  v_product RECORD;
  v_inventory RECORD;
  v_product_id UUID;
  v_requested_store_id UUID;
  v_store_id UUID;
  v_qty INTEGER;
  v_available NUMERIC;
  v_line_total NUMERIC(12,2);
  v_subtotal NUMERIC(12,2) := 0;
  v_shipping NUMERIC(12,2) := 0;
  v_tax NUMERIC(12,2) := 0;
  v_total NUMERIC(12,2) := 0;
  v_fulfillment TEXT := COALESCE(p_payload->>'fulfillment', 'delivery');
  v_gateway_code TEXT := p_payload->>'payment_gateway_code';
  v_gateway RECORD;
  v_payment_flow TEXT;
  v_order_status TEXT;
  v_payment_status TEXT := 'pending';
  v_expires_at TIMESTAMPTZ := now() + INTERVAL '20 minutes';
  v_reservations JSONB := '[]'::jsonb;
  v_shipping_method RECORD;
  v_idempotency_key TEXT := NULLIF(p_payload->>'idempotency_key', '');
  v_response JSONB;
  v_inserted INTEGER := 1;
BEGIN
  PERFORM public.expire_inventory_reservations();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'JWT user is required';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    INSERT INTO public.idempotency_keys (key, scope, actor_id, status)
    VALUES (v_idempotency_key, 'checkout', p_user_id, 'processing')
    ON CONFLICT (key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      SELECT response_payload INTO v_response
      FROM public.idempotency_keys
      WHERE key = v_idempotency_key AND status = 'completed';
      IF v_response IS NOT NULL THEN
        RETURN v_response;
      END IF;
      RETURN jsonb_build_object('ok', true, 'status', 'processing', 'idempotency_key', v_idempotency_key);
    END IF;
  END IF;

  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Cart lines are required';
  END IF;

  IF v_fulfillment NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid fulfillment mode %', v_fulfillment;
  END IF;

  SELECT * INTO v_gateway
  FROM public.payment_gateways
  WHERE code = v_gateway_code AND status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active payment gateway found for %', COALESCE(v_gateway_code, '');
  END IF;

  v_payment_flow := COALESCE(
    p_payload->>'payment_flow',
    CASE
      WHEN lower(v_gateway.provider) IN ('bank_transfer', 'deposit', 'transferencia') OR lower(v_gateway.code) IN ('bank-transfer', 'deposit', 'transferencia') THEN 'bank_transfer'
      WHEN lower(v_gateway.provider) IN ('cash', 'manual', 'cod', 'pay_in_store') OR lower(v_gateway.code) IN ('cod', 'cash', 'pay-in-store') THEN 'pay_in_store'
      ELSE 'card'
    END
  );

  v_order_status := CASE
    WHEN v_payment_flow = 'bank_transfer' THEN 'pending_bank_transfer'
    WHEN v_payment_flow = 'pay_in_store' THEN 'pending_store_payment'
    ELSE 'pending_payment'
  END;

  INSERT INTO public.orders (id, user_id, status, payment_status, payment_method, fulfillment, store_id, shipping_address, subtotal, shipping, tax, total, items, currency, reservation_expires_at)
  VALUES (v_order_id, p_user_id, v_order_status, v_payment_status, v_gateway.code, v_fulfillment, NULLIF(p_payload->>'store_id', '')::UUID, CASE WHEN v_fulfillment = 'delivery' THEN COALESCE(p_payload->'shipping_address', '{}'::jsonb) ELSE NULL END, 0, 0, 0, 0, v_lines, COALESCE(v_gateway.currency, 'GTQ'), v_expires_at)
  RETURNING order_number INTO v_order_number;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::UUID;
    v_qty := GREATEST(COALESCE((v_line->>'qty')::INTEGER, 0), 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid cart line %', v_line::TEXT;
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_product_id;
    END IF;
    IF v_product.is_active IS NOT TRUE OR COALESCE(v_product.ecommerce_status, 'draft') <> 'published' THEN
      RAISE EXCEPTION 'Product % is not published for ecommerce', v_product.sku;
    END IF;

    v_requested_store_id := CASE
      WHEN NULLIF(v_line->>'store_id', '') IS NOT NULL THEN (v_line->>'store_id')::UUID
      WHEN v_fulfillment = 'pickup' THEN NULLIF(p_payload->>'store_id', '')::UUID
      ELSE NULL
    END;

    SELECT * INTO v_inventory
    FROM public.inventory i
    WHERE i.product_id = v_product_id
      AND (v_requested_store_id IS NULL OR i.store_id = v_requested_store_id)
    ORDER BY i.available_ecommerce DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No inventory row found for product %', v_product.sku;
    END IF;

    v_available := COALESCE(v_inventory.available_ecommerce, 0);
    IF v_available < v_qty THEN
      RAISE EXCEPTION 'Insufficient ecommerce stock for SKU %. Requested %, available %', v_product.sku, v_qty, v_available;
    END IF;

    v_store_id := v_inventory.store_id;

    UPDATE public.inventory
    SET reserved_ecommerce = reserved_ecommerce + v_qty,
        updated_at = now()
    WHERE id = v_inventory.id;

    INSERT INTO public.inventory_reservations (order_id, user_id, product_id, store_id, qty, status, expires_at, reservation_key, source)
    VALUES (v_order_id, p_user_id, v_product_id, v_store_id, v_qty, 'reserved', v_expires_at, v_order_id::TEXT || ':' || v_product_id::TEXT || ':' || v_store_id::TEXT, 'checkout');

    v_line_total := ROUND((v_product.price * v_qty)::NUMERIC, 2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (order_id, product_id, sku, name, image, qty, unit_price, line_total, warehouse_code)
    VALUES (v_order_id, v_product_id, v_product.sku, v_product.name, v_product.image, v_qty, v_product.price, v_line_total, v_store_id::TEXT);

    v_reservations := v_reservations || jsonb_build_array(jsonb_build_object('product_id', v_product_id, 'sku', v_product.sku, 'store_id', v_store_id, 'qty', v_qty, 'expires_at', v_expires_at));
  END LOOP;

  IF v_fulfillment = 'delivery' THEN
    SELECT * INTO v_shipping_method
    FROM public.shipping_methods
    WHERE is_active = true AND type = 'delivery'
    ORDER BY sort_order NULLS LAST, base_price ASC
    LIMIT 1;
    IF FOUND THEN
      v_shipping := CASE WHEN v_shipping_method.free_from IS NOT NULL AND v_subtotal >= v_shipping_method.free_from THEN 0 ELSE COALESCE(v_shipping_method.base_price, 0) END;
    END IF;
  END IF;

  v_tax := ROUND((v_subtotal * 0.12)::NUMERIC, 2);
  v_total := v_subtotal + v_shipping + v_tax;

  UPDATE public.orders
  SET subtotal = v_subtotal, shipping = v_shipping, tax = v_tax, total = v_total, items = v_lines, updated_at = now()
  WHERE id = v_order_id;

  INSERT INTO public.payments (order_id, provider, amount, currency, status, metadata)
  VALUES (v_order_id, v_gateway.provider, v_total, COALESCE(v_gateway.currency, 'GTQ'), 'pending', jsonb_build_object('gateway_code', v_gateway.code, 'gateway_name', v_gateway.name, 'environment', v_gateway.environment, 'payment_flow', v_payment_flow, 'source', 'checkout-orchestrator'));

  INSERT INTO public.payment_events (order_id, event_type, provider, amount, currency, status, payload, created_by)
  VALUES (v_order_id, 'payment.initiated', v_gateway.provider, v_total, COALESCE(v_gateway.currency, 'GTQ'), 'pending', jsonb_build_object('payment_flow', v_payment_flow), p_user_id);

  INSERT INTO public.order_status_history (order_id, status, notes, created_by)
  VALUES (v_order_id, v_order_status, 'Orden creada con reserva ecommerce temporal', p_user_id);

  INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
  VALUES ('order.created', 'orders', v_order_id::TEXT, jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'status', v_order_status, 'payment_flow', v_payment_flow), 'pending');

  IF v_payment_flow IN ('bank_transfer', 'pay_in_store') THEN
    UPDATE public.orders SET ready_for_sap_at = now(), updated_at = now() WHERE id = v_order_id;
    INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
    VALUES ('orders.ready_for_sap', 'orders', v_order_id::TEXT, jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'create_invoice', false, 'reason', v_payment_flow), 'pending');
  END IF;

  v_response := jsonb_build_object('ok', true, 'order_id', v_order_id, 'order_number', v_order_number, 'status', v_order_status, 'payment_status', v_payment_status, 'payment_flow', v_payment_flow, 'reservation_expires_at', v_expires_at, 'subtotal', v_subtotal, 'shipping', v_shipping, 'tax', v_tax, 'total', v_total, 'reservations', v_reservations);

  IF v_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_keys
    SET status = 'completed', response_payload = v_response, completed_at = now()
    WHERE key = v_idempotency_key;
  END IF;

  RETURN v_response;
EXCEPTION WHEN OTHERS THEN
  IF v_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_keys
    SET status = 'failed', response_payload = jsonb_build_object('ok', false, 'error', SQLERRM), completed_at = now()
    WHERE key = v_idempotency_key;
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payment_event(
  p_actor_user_id UUID,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT := COALESCE(p_payload->>'event_type', p_payload->>'event');
  v_order_id UUID := NULLIF(p_payload->>'order_id', '')::UUID;
  v_idempotency_key TEXT := COALESCE(NULLIF(p_payload->>'idempotency_key', ''), v_event_type || ':' || COALESCE(v_order_id::TEXT, '') || ':' || COALESCE(p_payload->>'provider_event_id', ''));
  v_order RECORD;
  v_payment RECORD;
  v_response JSONB;
  v_inserted INTEGER := 0;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'JWT user is required';
  END IF;
  IF v_event_type IS NULL OR v_order_id IS NULL THEN
    RAISE EXCEPTION 'event_type and order_id are required';
  END IF;
  IF v_event_type IN ('bank_transfer.approved', 'bank_transfer.rejected', 'pickup.payment_confirmed') AND NOT public.is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Admin role is required for manual payment transitions';
  END IF;

  INSERT INTO public.idempotency_keys (key, scope, actor_id, status)
  VALUES (v_idempotency_key, 'payment_event', p_actor_user_id, 'processing')
  ON CONFLICT (key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT response_payload INTO v_response
    FROM public.idempotency_keys
    WHERE key = v_idempotency_key AND status = 'completed';
    IF v_response IS NOT NULL THEN
      RETURN v_response;
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'processing', 'idempotency_key', v_idempotency_key);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', v_order_id;
  END IF;
  IF v_order.user_id <> p_actor_user_id AND NOT public.is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Not authorized for order %', v_order_id;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE order_id = v_order_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment row not found for order %', v_order_id;
  END IF;

  INSERT INTO public.payment_events (payment_id, order_id, event_type, provider, provider_event_id, idempotency_key, amount, currency, status, payload, created_by)
  VALUES (v_payment.id, v_order_id, v_event_type, v_payment.provider, p_payload->>'provider_event_id', v_idempotency_key, COALESCE((p_payload->>'amount')::NUMERIC, v_payment.amount), COALESCE(p_payload->>'currency', v_payment.currency), 'processed', p_payload, p_actor_user_id);

  IF v_event_type IN ('payment.approved', 'bank_transfer.approved', 'pickup.payment_confirmed') THEN
    UPDATE public.payments SET status = 'approved', provider_payment_id = COALESCE(p_payload->>'provider_payment_id', provider_payment_id), updated_at = now() WHERE id = v_payment.id;
    UPDATE public.inventory_reservations SET status = 'committed', confirmed_at = now(), updated_at = now() WHERE order_id = v_order_id AND status = 'reserved';
    UPDATE public.orders
    SET payment_status = 'payment_confirmed',
        status = CASE WHEN fulfillment = 'pickup' THEN 'ready_for_pickup' ELSE 'fulfillment_pending' END,
        payment_confirmed_at = now(),
        ready_for_sap_at = COALESCE(ready_for_sap_at, now()),
        updated_at = now()
    WHERE id = v_order_id;
    INSERT INTO public.order_status_history (order_id, status, notes, created_by)
    VALUES (v_order_id, 'payment_confirmed', 'Pago confirmado y reserva ecommerce comprometida', p_actor_user_id);
    INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
    VALUES
      ('orders.ready_for_sap', 'orders', v_order_id::TEXT, jsonb_build_object('order_id', v_order_id, 'create_invoice', true, 'idempotency_key', v_idempotency_key || ':sales_order'), 'pending'),
      ('invoice.create_requested', 'orders', v_order_id::TEXT, jsonb_build_object('order_id', v_order_id, 'idempotency_key', v_idempotency_key || ':invoice'), 'pending');
  ELSIF v_event_type IN ('payment.rejected', 'payment.failed', 'bank_transfer.rejected', 'payment.expired') THEN
    PERFORM public.release_order_reservations(v_order_id, CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'released' END);
    UPDATE public.payments SET status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'rejected' END, updated_at = now() WHERE id = v_payment.id;
    UPDATE public.orders SET payment_status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'rejected' END, status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'payment_rejected' END, updated_at = now() WHERE id = v_order_id;
    INSERT INTO public.order_status_history (order_id, status, notes, created_by)
    VALUES (v_order_id, v_event_type, 'Pago no confirmado; reserva ecommerce liberada', p_actor_user_id);
  ELSE
    RAISE EXCEPTION 'Unsupported payment event %', v_event_type;
  END IF;

  v_response := jsonb_build_object('ok', true, 'event_type', v_event_type, 'order_id', v_order_id, 'idempotency_key', v_idempotency_key);
  UPDATE public.idempotency_keys SET status = 'completed', response_payload = v_response, completed_at = now() WHERE key = v_idempotency_key;
  RETURN v_response;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.idempotency_keys SET status = 'failed', response_payload = jsonb_build_object('ok', false, 'error', SQLERRM), completed_at = now() WHERE key = v_idempotency_key;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_gallery_from_images()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_urls JSONB;
  v_primary TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;
  SELECT COALESCE(jsonb_agg(url ORDER BY is_primary DESC, sort_order ASC, created_at ASC), '[]'::jsonb),
         (array_agg(url ORDER BY is_primary DESC, sort_order ASC, created_at ASC))[1]
  INTO v_urls, v_primary
  FROM public.product_images
  WHERE product_id = v_product_id;
  UPDATE public.products
  SET images = COALESCE(v_urls, '[]'::jsonb),
      image = COALESCE(v_primary, image),
      updated_at = now()
  WHERE id = v_product_id;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_images_sync_insert ON public.product_images;
CREATE TRIGGER trg_product_images_sync_insert
  AFTER INSERT OR UPDATE OR DELETE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_gallery_from_images();

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = r.tablename
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated ON public.%I', r.tablename, r.tablename);
      EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', r.tablename, r.tablename);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS products_ecommerce_visibility_idx ON public.products (ecommerce_status, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS products_item_code_idx ON public.products (item_code);
CREATE INDEX IF NOT EXISTS products_sap_item_code_idx ON public.products (sap_item_code);
CREATE INDEX IF NOT EXISTS product_images_product_sort_idx ON public.product_images (product_id, is_primary DESC, sort_order ASC);
CREATE INDEX IF NOT EXISTS inventory_product_store_idx ON public.inventory (product_id, store_id);
CREATE INDEX IF NOT EXISTS inventory_by_store_item_warehouse_idx ON public.inventory_by_store (item_code, warehouse_code);
CREATE INDEX IF NOT EXISTS inventory_by_store_product_store_idx ON public.inventory_by_store (product_id, store_id);
CREATE INDEX IF NOT EXISTS product_prices_item_price_list_idx ON public.product_prices (item_code, price_list_code);
CREATE INDEX IF NOT EXISTS sap_events_status_created_idx ON public.sap_events (status, received_at DESC);
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_queue_status_idx ON public.integration_event_queue (status, scheduled_at);
CREATE INDEX IF NOT EXISTS error_recovery_status_idx ON public.error_recovery_tasks (status, severity, created_at DESC);

INSERT INTO public.shipping_methods (code, name, type, base_price, free_from, estimated_days, sort_order, is_active)
VALUES
  ('pickup', 'Retiro en tienda', 'pickup', 0, NULL, 'Mismo dia', 0, true),
  ('gt-city', 'Envio Guatemala ciudad', 'delivery', 45, 1000, '24-48h', 10, true),
  ('departmental', 'Envio departamental', 'delivery', 75, 1500, '48-72h', 20, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.payment_gateways (code, name, provider, environment, status, currency, supports_installments)
VALUES
  ('bac-visanet', 'BAC / Visanet', 'card', 'production', 'active', 'GTQ', true),
  ('bank-transfer', 'Transferencia o deposito', 'bank_transfer', 'production', 'active', 'GTQ', false),
  ('cod', 'Pago contra entrega / caja', 'cash', 'production', 'active', 'GTQ', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.stores (code, sap_warehouse_code, name, city, address, hours, is_active)
VALUES ('01', '01', 'Renova tienda central', 'Guatemala', 'Por configurar', 'Lunes a sabado', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.warehouses (sap_warehouse_code, branch_code, name, store_id, is_active)
SELECT '01', 'DEFAULT', 'Bodega 01', s.id, true
FROM public.stores s
WHERE s.code = '01'
ON CONFLICT (sap_warehouse_code) DO NOTHING;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_by_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_shipping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_event_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_business_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage rows" ON public.%I', r.tablename);
    EXECUTE format('CREATE POLICY "Admins manage rows" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Public read active brands" ON public.brands;
CREATE POLICY "Public read active brands" ON public.brands FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read active categories" ON public.categories;
CREATE POLICY "Public read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read active stores" ON public.stores;
CREATE POLICY "Public read active stores" ON public.stores FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read published products" ON public.products;
CREATE POLICY "Public read published products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true AND ecommerce_status = 'published');
DROP POLICY IF EXISTS "Public read product images" ON public.product_images;
CREATE POLICY "Public read product images" ON public.product_images FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true AND p.ecommerce_status = 'published'));
DROP POLICY IF EXISTS "Public read product inventory" ON public.inventory;
CREATE POLICY "Public read product inventory" ON public.inventory FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true AND p.ecommerce_status = 'published'));
DROP POLICY IF EXISTS "Public read shipping methods" ON public.shipping_methods;
CREATE POLICY "Public read shipping methods" ON public.shipping_methods FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read active banners" ON public.promotional_banners;
CREATE POLICY "Public read active banners" ON public.promotional_banners FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupon_rules;
CREATE POLICY "Public read active coupons" ON public.coupon_rules FOR SELECT TO anon, authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Public read approved reviews" ON public.product_reviews;
CREATE POLICY "Public read approved reviews" ON public.product_reviews FOR SELECT TO anon, authenticated USING (status = 'approved');

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Users read own order items" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin(auth.uid()))));
DROP POLICY IF EXISTS "Users read own order history" ON public.order_status_history;
CREATE POLICY "Users read own order history" ON public.order_status_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin(auth.uid()))));
DROP POLICY IF EXISTS "Users read own payments" ON public.payments;
CREATE POLICY "Users read own payments" ON public.payments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.is_admin(auth.uid()))));
DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist_items;
CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users insert own reviews" ON public.product_reviews;
CREATE POLICY "Users insert own reviews" ON public.product_reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.brands, public.categories, public.products, public.product_images, public.inventory, public.stores, public.shipping_methods, public.promotional_banners, public.coupon_rules, public.product_reviews, public.ecommerce_payment_gateways TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.sap_reclaim_stuck_sap_event(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_products(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_prices(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_inventory(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkout_create_order(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_inventory_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_reservations(UUID, TEXT) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('logo', 'logo', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('product-media', 'product-media', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('category-media', 'category-media', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('banner-media', 'banner-media', true, 15728640, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('brand-media', 'brand-media', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif']),
  ('bulk-image-imports', 'bulk-image-imports', false, 104857600, ARRAY['application/zip', 'application/x-zip-compressed'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read renova media" ON storage.objects;
CREATE POLICY "Public read renova media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media'));

DROP POLICY IF EXISTS "Admins manage renova media" ON storage.objects;
CREATE POLICY "Admins manage renova media"
  ON storage.objects FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMIT;
