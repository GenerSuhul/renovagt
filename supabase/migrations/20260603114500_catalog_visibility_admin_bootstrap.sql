-- RENOVA compatibility hardening.
-- Applies after the middleware contract migration. It keeps SAP imports gated,
-- exposes already-curated legacy products, and bootstraps a safe admin profile.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value)
VALUES (
  'orders_ready_for_sap_enabled',
  jsonb_build_object(
    'enabled', false,
    'reason', 'Gate disabled until idempotency, reservations, payments, SAP mappings and recovery flows are fully validated',
    'required_tables', ARRAY[
      'idempotency_keys',
      'inventory_reservations',
      'order_status_history',
      'payments',
      'payment_events',
      'error_recovery_tasks',
      'sap_entity_mappings',
      'sap_sync_logs'
    ]
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orders_ready_for_sap_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value->>'enabled')::boolean, false)
  FROM public.system_settings
  WHERE key = 'orders_ready_for_sap_enabled'
$$;

CREATE OR REPLACE FUNCTION public.guard_sap_activation_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type IN ('orders.ready_for_sap', 'invoice.create_requested')
     AND NOT public.orders_ready_for_sap_enabled() THEN
    NEW.payload = COALESCE(NEW.payload, '{}'::jsonb) || jsonb_build_object(
      'blocked_event', NEW.event_type,
      'blocked_reason', 'orders_ready_for_sap gate disabled',
      'blocked_at', now()
    );
    NEW.event_type = CASE
      WHEN NEW.event_type = 'invoice.create_requested' THEN 'invoice.sap_gate_blocked'
      ELSE 'orders.sap_gate_blocked'
    END;
    NEW.status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE IF EXISTS public.error_recovery_tasks
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Tarea de recuperacion',
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_payload JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'error_recovery_tasks'
      AND column_name = 'process_type'
  ) THEN
    EXECUTE $sql$
      UPDATE public.error_recovery_tasks
      SET task_type = COALESCE(NULLIF(task_type, ''), process_type)
      WHERE task_type = 'manual'
    $sql$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_guard_sap_activation_queue ON public.integration_event_queue;
CREATE TRIGGER trg_guard_sap_activation_queue
  BEFORE INSERT OR UPDATE OF event_type ON public.integration_event_queue
  FOR EACH ROW EXECUTE FUNCTION public.guard_sap_activation_queue();

CREATE OR REPLACE FUNCTION public.create_recovery_task_from_failed_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idempotency_key TEXT := COALESCE(NEW.payload->>'idempotency_key', NEW.id::text);
BEGIN
  IF NEW.status = 'failed'
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status
     AND NEW.event_type IN (
       'orders.ready_for_sap',
       'invoice.create_requested',
       'orders.sap_gate_blocked',
       'invoice.sap_gate_blocked'
     ) THEN
    INSERT INTO public.error_recovery_tasks (
      severity,
      scope,
      task_type,
      entity_type,
      entity_id,
      idempotency_key,
      status,
      title,
      error,
      request_payload
    )
    SELECT
      'critical',
      'sap_outbound',
      'integration_queue_failed',
      NEW.aggregate_type,
      NEW.aggregate_id,
      v_idempotency_key,
      'open',
      'Evento SAP critico fallido',
      COALESCE(NEW.last_error, 'integration_event_queue marked failed'),
      NEW.payload
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.error_recovery_tasks existing
      WHERE existing.idempotency_key = v_idempotency_key
        AND existing.status IN ('open', 'in_progress')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_failed_queue_recovery ON public.integration_event_queue;
CREATE TRIGGER trg_failed_queue_recovery
  AFTER UPDATE OF status ON public.integration_event_queue
  FOR EACH ROW EXECUTE FUNCTION public.create_recovery_task_from_failed_queue();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.products
SET sap_item_code = COALESCE(NULLIF(sap_item_code, ''), NULLIF(item_code, ''), NULLIF(external_id, ''), sku),
    item_code = COALESCE(NULLIF(item_code, ''), NULLIF(sap_item_code, ''), sku),
    external_id = COALESCE(NULLIF(external_id, ''), NULLIF(sap_item_code, ''), sku)
WHERE COALESCE(NULLIF(sap_item_code, ''), NULLIF(item_code, ''), NULLIF(external_id, ''), sku) IS NOT NULL;

-- Existing records that predate ecommerce_status defaulted to draft. If they
-- already have enough ecommerce content, publish them. Future SAP imports use
-- needs_enrichment and are intentionally excluded here.
UPDATE public.products
SET ecommerce_status = 'published',
    enrichment_status = 'complete',
    enrichment_required = false
WHERE is_active = true
  AND ecommerce_status = 'draft'
  AND COALESCE(NULLIF(name, ''), NULLIF(sku, '')) IS NOT NULL
  AND COALESCE(NULLIF(slug, ''), id::text) IS NOT NULL
  AND COALESCE(price, 0) >= 0
  AND (
    NULLIF(description, '') IS NOT NULL
    OR NULLIF(short_description, '') IS NOT NULL
    OR NULLIF(image, '') IS NOT NULL
    OR category_id IS NOT NULL
  );

DO $$
BEGIN
  IF to_regclass('public.price_lists') IS NOT NULL THEN
    INSERT INTO public.admin_price_lists (code, name, customer_type, currency, is_active)
    SELECT
      code,
      COALESCE(NULLIF(name, ''), code),
      CASE
        WHEN lower(COALESCE(customer_type, 'all')) IN ('b2b', 'b2c', 'all') THEN lower(COALESCE(customer_type, 'all'))
        ELSE 'all'
      END,
      CASE WHEN currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(currency, 'GTQ') END,
      status = 'active'
    FROM public.price_lists
    ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        customer_type = EXCLUDED.customer_type,
        currency = EXCLUDED.currency,
        is_active = EXCLUDED.is_active;
  END IF;

  IF to_regclass('public.product_prices') IS NOT NULL THEN
    INSERT INTO public.admin_price_list_items (price_list_id, product_id, price, min_qty)
    SELECT apl.id, p.id, GREATEST(pp.price, 0)::numeric(12,2), 1
    FROM public.product_prices pp
    JOIN public.products p
      ON p.sap_item_code = pp.item_code
      OR p.item_code = pp.item_code
      OR p.sku = pp.item_code
    JOIN public.admin_price_lists apl
      ON apl.code = pp.price_list_code
    ON CONFLICT (price_list_id, product_id, min_qty) DO UPDATE
    SET price = EXCLUDED.price;

    WITH preferred_prices AS (
      SELECT DISTINCT ON (p.id)
        p.id,
        GREATEST(pp.price, 0)::numeric(12,2) AS price,
        CASE WHEN pp.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(pp.currency, 'GTQ') END AS currency
      FROM public.product_prices pp
      JOIN public.products p
        ON p.sap_item_code = pp.item_code
        OR p.item_code = pp.item_code
        OR p.sku = pp.item_code
      ORDER BY
        p.id,
        CASE
          WHEN pp.price_list_code IN ('B2C-GENERAL', 'B2C', '1') THEN 0
          ELSE 1
        END,
        pp.created_at DESC
    )
    UPDATE public.products p
    SET price = preferred_prices.price,
        currency = preferred_prices.currency
    FROM preferred_prices
    WHERE p.id = preferred_prices.id
      AND COALESCE(p.price, 0) = 0;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.inventory_by_store') IS NOT NULL THEN
    INSERT INTO public.inventory (
      product_id,
      store_id,
      qty,
      on_hand,
      committed,
      reserved_ecommerce,
      safety_stock,
      last_sap_sync_at,
      updated_at
    )
    SELECT
      ibs.product_id,
      ibs.store_id,
      GREATEST(floor(ibs.on_hand), 0)::integer,
      GREATEST(floor(ibs.on_hand), 0)::integer,
      GREATEST(floor(ibs.committed), 0)::integer,
      GREATEST(floor(ibs.reserved_ecommerce), 0)::integer,
      GREATEST(floor(ibs.safety_stock), 0)::integer,
      ibs.last_sap_sync_at,
      now()
    FROM public.inventory_by_store ibs
    WHERE ibs.product_id IS NOT NULL
      AND ibs.store_id IS NOT NULL
    ON CONFLICT (product_id, store_id) DO UPDATE
    SET qty = EXCLUDED.qty,
        on_hand = EXCLUDED.on_hand,
        committed = EXCLUDED.committed,
        reserved_ecommerce = EXCLUDED.reserved_ecommerce,
        safety_stock = EXCLUDED.safety_stock,
        last_sap_sync_at = EXCLUDED.last_sap_sync_at,
        updated_at = now();
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'b2b_customer', 'admin', 'super_admin')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'pending'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer'),
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = COALESCE(public.profiles.email, EXCLUDED.email),
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id AND NOT public.is_admin(auth.uid()) THEN
    NEW.role = OLD.role;
    NEW.status = OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

CREATE OR REPLACE FUNCTION public.handle_new_customer_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.customer_accounts') IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_accounts'
      AND column_name = 'email'
  ) THEN
    INSERT INTO public.customer_accounts (
      id,
      user_id,
      email,
      full_name,
      account_type,
      status
    )
    VALUES (
      gen_random_uuid(),
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'b2c',
      'active'
    )
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.customer_accounts (id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Admins read profiles" ON public.profiles;
CREATE POLICY "Admins read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DO $$
BEGIN
  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Admins manage customers" ON public.customers;
    CREATE POLICY "Admins manage customers"
      ON public.customers FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;

  IF to_regclass('public.sap_business_partners') IS NOT NULL THEN
    ALTER TABLE public.sap_business_partners ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "sap bp read auth" ON public.sap_business_partners;
    DROP POLICY IF EXISTS "Admins manage sap business partners" ON public.sap_business_partners;
    CREATE POLICY "Admins manage sap business partners"
      ON public.sap_business_partners FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$
DECLARE
  v_admin_email TEXT := COALESCE(NULLIF(current_setting('app.renova_admin_email', true), ''), 'admin@renova.local');
  v_admin_password TEXT := COALESCE(NULLIF(current_setting('app.renova_admin_password', true), ''), 'RenovaAdmin2026!');
  v_admin_id UUID;
  v_identity_id_type TEXT;
  v_identity_json JSONB;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE NOTICE 'auth.users is not available; skipping auth admin bootstrap';
    RETURN;
  END IF;

  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE lower(email) = lower(v_admin_email)
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      is_super_admin,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_admin_email,
      crypt(v_admin_password, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      false,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Renova Super Admin', 'role', 'super_admin'),
      now(),
      now()
    );
  END IF;

  UPDATE auth.users
  SET confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      is_super_admin = COALESCE(is_super_admin, false)
  WHERE id = v_admin_id;

  v_identity_json := jsonb_build_object(
    'sub', v_admin_id::text,
    'email', v_admin_email,
    'email_verified', true,
    'phone_verified', false
  );

  IF to_regclass('auth.identities') IS NOT NULL THEN
    BEGIN
      SELECT data_type INTO v_identity_id_type
      FROM information_schema.columns
      WHERE table_schema = 'auth'
        AND table_name = 'identities'
        AND column_name = 'id'
      LIMIT 1;

      IF v_identity_id_type = 'uuid' THEN
        INSERT INTO auth.identities (
          id,
          user_id,
          provider_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        VALUES (
          gen_random_uuid(),
          v_admin_id,
          v_admin_id::text,
          v_identity_json,
          'email',
          now(),
          now(),
          now()
        )
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO auth.identities (
          id,
          user_id,
          provider_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        VALUES (
          v_admin_id::text,
          v_admin_id,
          v_admin_id::text,
          v_identity_json,
          'email',
          now(),
          now(),
          now()
        )
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'auth.identities bootstrap skipped: %', SQLERRM;
    END;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (v_admin_id, 'Renova Super Admin', v_admin_email, 'super_admin', 'active')
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = 'super_admin',
      status = 'active',
      updated_at = now();

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_admin_id, 'super_admin')
    ON CONFLICT (user_id, role) DO UPDATE
    SET updated_at = now();
  END IF;
END $$;

GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read system settings" ON public.system_settings;
CREATE POLICY "Admins read system settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
