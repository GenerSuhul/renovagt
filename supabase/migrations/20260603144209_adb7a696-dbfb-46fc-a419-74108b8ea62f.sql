
-- ============================================================
-- RENOVA enterprise core: roles, tables, RLS, RPCs, admin bootstrap
-- ============================================================

-- 1) Helper: roles & is_admin -------------------------------------------------
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('super_admin','admin','staff','customer');
  END IF;
END
$mig$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin','admin')
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$fn$;

-- 2) Products / inventory new columns ----------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ecommerce_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS shipping_class text,
  ADD COLUMN IF NOT EXISTS safety_stock_default integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sap_raw_payload jsonb;

-- Publish curated products
UPDATE public.products
SET ecommerce_status = 'published',
    enrichment_status = 'enriched',
    enrichment_required = false
WHERE is_active = true
  AND ecommerce_status = 'draft'
  AND name IS NOT NULL AND name <> ''
  AND slug IS NOT NULL AND slug <> ''
  AND price > 0
  AND (description IS NOT NULL OR short_description IS NOT NULL OR image IS NOT NULL);

DROP POLICY IF EXISTS "products public read" ON public.products;
CREATE POLICY "products public read" ON public.products
  FOR SELECT TO public
  USING (is_active = true AND ecommerce_status = 'published');

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS reserved_ecommerce integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock integer NOT NULL DEFAULT 0;

-- 3) Profiles extensions ------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- 4) Orders gate columns ------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ready_for_sap boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sap_gate_blocked boolean NOT NULL DEFAULT true;

ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- 5) New tables ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text PRIMARY KEY,
  scope text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idempotency_keys TO authenticated;
GRANT ALL ON public.idempotency_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  payment_id uuid,
  provider text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;

CREATE TABLE IF NOT EXISTS public.error_recovery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type text NOT NULL,
  aggregate_type text,
  aggregate_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_recovery_tasks TO authenticated;
GRANT ALL ON public.error_recovery_tasks TO service_role;

CREATE TABLE IF NOT EXISTS public.sap_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  local_id text NOT NULL,
  sap_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, local_id),
  UNIQUE (entity_type, sap_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sap_entity_mappings TO authenticated;
GRANT ALL ON public.sap_entity_mappings TO service_role;

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'GTQ',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_price_lists TO authenticated;
GRANT ALL ON public.admin_price_lists TO service_role;
ALTER TABLE public.admin_price_lists ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.admin_price_lists(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  sap_item_code text,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_price_list_items TO authenticated;
GRANT ALL ON public.admin_price_list_items TO service_role;
ALTER TABLE public.admin_price_list_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  email text,
  name text,
  phone text,
  sap_card_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.sap_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job text NOT NULL,
  direction text NOT NULL,
  status text NOT NULL,
  records_processed integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.sap_sync_logs TO authenticated;
GRANT ALL ON public.sap_sync_logs TO service_role;
ALTER TABLE public.sap_sync_logs ENABLE ROW LEVEL SECURITY;

-- Seed gate flag
INSERT INTO public.system_settings (key, value, description)
VALUES ('orders_ready_for_sap_enabled', 'false'::jsonb, 'Master switch to allow orders to be pushed to SAP')
ON CONFLICT (key) DO NOTHING;

-- Trigger: block ready_for_sap until gate is on
CREATE OR REPLACE FUNCTION public.orders_enforce_sap_gate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_enabled boolean;
BEGIN
  SELECT COALESCE((value)::text::boolean, false) INTO v_enabled
  FROM public.system_settings WHERE key = 'orders_ready_for_sap_enabled';
  IF NEW.ready_for_sap = true AND COALESCE(v_enabled,false) = false THEN
    NEW.ready_for_sap := false;
    NEW.sap_gate_blocked := true;
  ELSE
    NEW.sap_gate_blocked := false;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS orders_sap_gate ON public.orders;
CREATE TRIGGER orders_sap_gate
  BEFORE INSERT OR UPDATE OF ready_for_sap ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_enforce_sap_gate();

-- 6) RPCs ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_create_order(
  p_user_id uuid, p_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_order_id uuid;
BEGIN
  INSERT INTO public.orders (user_id, items, subtotal, total, currency, payment_method, fulfillment, notes)
  VALUES (
    p_user_id,
    COALESCE(p_payload->'items','[]'::jsonb),
    COALESCE((p_payload->>'subtotal')::numeric,0),
    COALESCE((p_payload->>'total')::numeric,0),
    COALESCE(p_payload->>'currency','GTQ'),
    p_payload->>'payment_method',
    COALESCE(p_payload->>'fulfillment','delivery'),
    p_payload->>'notes'
  ) RETURNING id INTO v_order_id;
  INSERT INTO public.order_status_history(order_id, to_status, changed_by, reason)
  VALUES (v_order_id, 'pending', p_user_id, 'order_created');
  RETURN v_order_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.apply_payment_event(
  p_order_id uuid, p_event jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.payment_events(order_id, provider, event_type, payload)
  VALUES (
    p_order_id,
    COALESCE(p_event->>'provider','unknown'),
    COALESCE(p_event->>'event_type','unknown'),
    p_event
  );
  IF (p_event->>'event_type') = 'approved' THEN
    UPDATE public.orders SET payment_status = 'paid', status = 'paid' WHERE id = p_order_id;
  ELSIF (p_event->>'event_type') = 'rejected' THEN
    UPDATE public.orders SET payment_status = 'rejected' WHERE id = p_order_id;
  ELSIF (p_event->>'event_type') = 'refunded' THEN
    UPDATE public.orders SET payment_status = 'refunded' WHERE id = p_order_id;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.release_order_reservations(
  p_order_id uuid, p_reason text DEFAULT 'release'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_count integer;
BEGIN
  WITH rel AS (
    UPDATE public.inventory_reservations
    SET status = 'released'
    WHERE order_id = p_order_id AND status = 'reserved'
    RETURNING product_id, store_id, qty
  ), upd AS (
    UPDATE public.inventory i
    SET committed = GREATEST(0, i.committed - r.qty)
    FROM rel r WHERE i.product_id = r.product_id AND i.store_id = r.store_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;
  RETURN COALESCE(v_count,0);
END
$fn$;

CREATE OR REPLACE FUNCTION public.expire_inventory_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_count integer := 0;
BEGIN
  WITH exp AS (
    UPDATE public.inventory_reservations
    SET status = 'expired'
    WHERE status = 'reserved' AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING product_id, store_id, qty
  ), upd AS (
    UPDATE public.inventory i
    SET committed = GREATEST(0, i.committed - e.qty)
    FROM exp e WHERE i.product_id = e.product_id AND i.store_id = e.store_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;
  RETURN v_count;
END
$fn$;

-- 7) Enable RLS + policies (the block the user pasted, fixed) ----------------
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_entity_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage inventory reservations" ON public.inventory_reservations;
DROP POLICY IF EXISTS "Authenticated manage order status" ON public.order_status_history;
DROP POLICY IF EXISTS "Authenticated manage integration queue" ON public.integration_event_queue;
DROP POLICY IF EXISTS "Authenticated manage sap logs" ON public.sap_sync_logs;
DROP POLICY IF EXISTS "Authenticated manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated payment gateways CRUD" ON public.payment_gateways;
DROP POLICY IF EXISTS "Authenticated admin price lists CRUD" ON public.admin_price_lists;
DROP POLICY IF EXISTS "Authenticated admin price list items CRUD" ON public.admin_price_list_items;
DROP POLICY IF EXISTS "Authenticated customer accounts CRUD" ON public.customer_accounts;

DROP POLICY IF EXISTS "Admins manage inventory reservations" ON public.inventory_reservations;
CREATE POLICY "Admins manage inventory reservations" ON public.inventory_reservations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users read own reservations" ON public.inventory_reservations;
CREATE POLICY "Users read own reservations" ON public.inventory_reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage order status" ON public.order_status_history;
CREATE POLICY "Admins manage order status" ON public.order_status_history FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users read own order status" ON public.order_status_history;
CREATE POLICY "Users read own order status" ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage payment events" ON public.payment_events;
CREATE POLICY "Admins manage payment events" ON public.payment_events FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Users read own payment events" ON public.payment_events;
CREATE POLICY "Users read own payment events" ON public.payment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage recovery tasks" ON public.error_recovery_tasks;
CREATE POLICY "Admins manage recovery tasks" ON public.error_recovery_tasks FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage idempotency keys" ON public.idempotency_keys;
CREATE POLICY "Admins manage idempotency keys" ON public.idempotency_keys FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage sap entity mappings" ON public.sap_entity_mappings;
CREATE POLICY "Admins manage sap entity mappings" ON public.sap_entity_mappings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage integration queue" ON public.integration_event_queue;
CREATE POLICY "Admins manage integration queue" ON public.integration_event_queue FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage price lists" ON public.admin_price_lists;
CREATE POLICY "Admins manage price lists" ON public.admin_price_lists FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage price list items" ON public.admin_price_list_items;
CREATE POLICY "Admins manage price list items" ON public.admin_price_list_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage customer accounts" ON public.customer_accounts;
CREATE POLICY "Admins manage customer accounts" ON public.customer_accounts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage payment gateways" ON public.payment_gateways;
CREATE POLICY "Admins manage payment gateways" ON public.payment_gateways FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read sap logs" ON public.sap_sync_logs;
CREATE POLICY "Admins read sap logs" ON public.sap_sync_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.checkout_create_order(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_inventory_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_reservations(UUID, TEXT) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.idempotency_keys, public.payment_events,
  public.error_recovery_tasks, public.sap_entity_mappings
TO authenticated;

GRANT ALL ON
  public.idempotency_keys, public.payment_events,
  public.error_recovery_tasks, public.sap_entity_mappings
TO service_role;

-- 8) customers + sap_business_partners admin policies ------------------------
DO $blk$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Admins manage customers" ON public.customers;
    CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated
      USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;

  IF to_regclass('public.sap_business_partners') IS NOT NULL THEN
    ALTER TABLE public.sap_business_partners ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sap bp read auth" ON public.sap_business_partners;
    DROP POLICY IF EXISTS "Admins manage sap business partners" ON public.sap_business_partners;
    CREATE POLICY "Admins manage sap business partners" ON public.sap_business_partners FOR ALL TO authenticated
      USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END
$blk$;

-- 9) Admin user bootstrap -----------------------------------------------------
DO $admin$
DECLARE
  v_admin_email TEXT := 'admin@renova.local';
  v_admin_password TEXT := 'RenovaAdmin2026!';
  v_admin_id UUID;
  v_identity_id_type TEXT;
  v_identity_json JSONB;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users not available; skipping';
    RETURN;
  END IF;

  SELECT id INTO v_admin_id FROM auth.users WHERE lower(email)=lower(v_admin_email) LIMIT 1;

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_admin_email, crypt(v_admin_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Renova Super Admin','role','super_admin'),
      now(), now()
    );
  END IF;

  v_identity_json := jsonb_build_object(
    'sub', v_admin_id::text, 'email', v_admin_email,
    'email_verified', true, 'phone_verified', false
  );

  IF to_regclass('auth.identities') IS NOT NULL THEN
    BEGIN
      SELECT data_type INTO v_identity_id_type FROM information_schema.columns
      WHERE table_schema='auth' AND table_name='identities' AND column_name='id' LIMIT 1;

      IF v_identity_id_type = 'uuid' THEN
        INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (gen_random_uuid(), v_admin_id, v_admin_id::text, v_identity_json, 'email', now(), now(), now())
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (v_admin_id::text, v_admin_id, v_admin_id::text, v_identity_json, 'email', now(), now(), now())
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'identities bootstrap skipped: %', SQLERRM;
    END;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (v_admin_id, 'Renova Super Admin', v_admin_email, 'super_admin', 'active')
  ON CONFLICT (id) DO UPDATE
  SET full_name=EXCLUDED.full_name, email=EXCLUDED.email,
      role='super_admin', status='active', updated_at=now();

  INSERT INTO public.user_roles(user_id, role) VALUES (v_admin_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$admin$;

-- 10) system_settings -------------------------------------------------------
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read system settings" ON public.system_settings;
CREATE POLICY "Admins read system settings" ON public.system_settings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
