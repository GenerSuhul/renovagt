-- RENOVA ecommerce middleware contract hardening.
-- SAP B1 remains the source of truth; Supabase is the ecommerce read model
-- and transactional orchestration layer for cart, reservations, payments,
-- orders, fulfillment, admin and recovery.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'b2b_customer', 'admin', 'super_admin')),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'pending'));

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'b2b_customer', 'admin', 'super_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = uid
        AND p.status = 'active'
        AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND ur.role IN ('admin', 'super_admin')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = uid
        AND p.status = 'active'
        AND p.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = uid
        AND ur.role = 'super_admin'
    )
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.integration_event_queue') IS NOT NULL THEN
    ALTER TABLE public.integration_event_queue
      ALTER COLUMN aggregate_id TYPE TEXT USING aggregate_id::TEXT;
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ecommerce_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (ecommerce_status IN ('draft', 'needs_enrichment', 'enriched', 'published', 'archived')),
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (enrichment_status IN ('needs_enrichment', 'in_review', 'complete')),
  ADD COLUMN IF NOT EXISTS enrichment_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_class TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS safety_stock_default INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seo_slug_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sap_raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.products
SET ecommerce_status = 'published',
    enrichment_status = 'complete',
    enrichment_required = false
WHERE sap_item_code IS NULL
  AND is_active = true
  AND ecommerce_status IN ('draft', 'needs_enrichment');

DROP POLICY IF EXISTS "Public read active products" ON public.products;
DROP POLICY IF EXISTS "products public read" ON public.products;
DROP POLICY IF EXISTS "Public read published products" ON public.products;
CREATE POLICY "Public read published products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND ecommerce_status = 'published');

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS on_hand INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_ecommerce INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sap_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.inventory
SET on_hand = GREATEST(on_hand, qty)
WHERE on_hand = 0 AND qty > 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory'
      AND column_name = 'available_ecommerce'
  ) THEN
    ALTER TABLE public.inventory
      ADD COLUMN available_ecommerce INTEGER GENERATED ALWAYS AS (
        GREATEST(on_hand - committed - reserved_ecommerce - safety_stock, 0)
      ) STORED;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_inventory_updated ON public.inventory;
CREATE TRIGGER trg_inventory_updated
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reservation_key TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'checkout',
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_key_idx
  ON public.inventory_reservations (reservation_key)
  WHERE reservation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_reservations_order_idx
  ON public.inventory_reservations (order_id);

CREATE INDEX IF NOT EXISTS inventory_reservations_expiry_idx
  ON public.inventory_reservations (status, expires_at);

DROP TRIGGER IF EXISTS trg_inventory_reservations_updated ON public.inventory_reservations;
CREATE TRIGGER trg_inventory_reservations_updated
  BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS ready_for_sap_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sap_invoice_doc_entry INTEGER,
  ADD COLUMN IF NOT EXISTS sap_invoice_doc_num TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fiscal_number TEXT;

DROP TRIGGER IF EXISTS trg_orders_updated ON public.orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  actor_id UUID,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  request_hash TEXT,
  response_payload JSONB,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_idempotency_keys_updated ON public.idempotency_keys;
CREATE TRIGGER trg_idempotency_keys_updated
  BEFORE UPDATE ON public.idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_idempotency_idx
  ON public.payment_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON public.payment_events (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.error_recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL DEFAULT 'critical'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored')),
  task_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  idempotency_key TEXT,
  correlation_id TEXT,
  error_message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_recovery_tasks_status_idx
  ON public.error_recovery_tasks (status, severity, created_at DESC);

DROP TRIGGER IF EXISTS trg_error_recovery_tasks_updated ON public.error_recovery_tasks;
CREATE TRIGGER trg_error_recovery_tasks_updated
  BEFORE UPDATE ON public.error_recovery_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

DROP TRIGGER IF EXISTS trg_sap_entity_mappings_updated ON public.sap_entity_mappings;
CREATE TRIGGER trg_sap_entity_mappings_updated
  BEFORE UPDATE ON public.sap_entity_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sap_events
  ADD COLUMN IF NOT EXISTS payload_count INTEGER,
  ADD COLUMN IF NOT EXISTS expected_rows INTEGER,
  ADD COLUMN IF NOT EXISTS processed_rows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_rows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]'::jsonb;

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
        released_at = now()
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
    SET status = CASE
          WHEN status IN ('pending_payment', 'pending_bank_transfer', 'pending_store_payment', 'pending') THEN 'expired'
          ELSE status
        END,
        payment_status = CASE
          WHEN payment_status = 'pending' THEN 'expired'
          ELSE payment_status
        END
    WHERE id = r.order_id
      AND status IN ('pending_payment', 'pending_bank_transfer', 'pending_store_payment', 'pending');

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
  v_available INTEGER;
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
BEGIN
  PERFORM public.expire_inventory_reservations();

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'JWT user is required';
  END IF;

  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Cart lines are required';
  END IF;

  IF v_fulfillment NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid fulfillment mode %', v_fulfillment;
  END IF;

  SELECT *
  INTO v_gateway
  FROM public.payment_gateways
  WHERE code = v_gateway_code
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active payment gateway found for %', COALESCE(v_gateway_code, '');
  END IF;

  v_payment_flow := COALESCE(
    p_payload->>'payment_flow',
    CASE
      WHEN lower(v_gateway.provider) IN ('bank_transfer', 'deposit', 'transferencia')
        OR lower(v_gateway.code) IN ('bank-transfer', 'deposit', 'transferencia') THEN 'bank_transfer'
      WHEN lower(v_gateway.provider) IN ('cash', 'manual', 'cod', 'pay_in_store')
        OR lower(v_gateway.code) IN ('cod', 'cash', 'pay-in-store') THEN 'pay_in_store'
      ELSE 'card'
    END
  );

  v_order_status := CASE
    WHEN v_payment_flow = 'bank_transfer' THEN 'pending_bank_transfer'
    WHEN v_payment_flow = 'pay_in_store' THEN 'pending_store_payment'
    ELSE 'pending_payment'
  END;

  INSERT INTO public.orders (
    id,
    user_id,
    status,
    payment_status,
    payment_method,
    fulfillment,
    store_id,
    shipping_address,
    subtotal,
    shipping,
    tax,
    total,
    items,
    currency,
    reservation_expires_at
  )
  VALUES (
    v_order_id,
    p_user_id,
    v_order_status,
    v_payment_status,
    v_gateway.code,
    v_fulfillment,
    NULLIF(p_payload->>'store_id', ''),
    CASE WHEN v_fulfillment = 'delivery' THEN COALESCE(p_payload->'shipping_address', '{}'::jsonb) ELSE NULL END,
    0,
    0,
    0,
    0,
    v_lines,
    COALESCE(v_gateway.currency, 'GTQ'),
    v_expires_at
  )
  RETURNING order_number INTO v_order_number;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::uuid;
    v_qty := GREATEST(COALESCE((v_line->>'qty')::integer, 0), 0);

    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid cart line %', v_line::text;
    END IF;

    SELECT *
    INTO v_product
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
      WHEN NULLIF(v_line->>'store_id', '') IS NOT NULL THEN (v_line->>'store_id')::uuid
      WHEN v_fulfillment = 'pickup' THEN NULLIF(p_payload->>'store_id', '')::uuid
      ELSE NULL
    END;

    SELECT
      i.id,
      i.store_id,
      i.on_hand,
      i.committed,
      i.reserved_ecommerce,
      i.safety_stock,
      GREATEST(i.on_hand - i.committed - i.reserved_ecommerce - i.safety_stock, 0) AS available_ecommerce
    INTO v_inventory
    FROM public.inventory i
    WHERE i.product_id = v_product_id
      AND (v_requested_store_id IS NULL OR i.store_id = v_requested_store_id)
    ORDER BY GREATEST(i.on_hand - i.committed - i.reserved_ecommerce - i.safety_stock, 0) DESC
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
    SET reserved_ecommerce = reserved_ecommerce + v_qty
    WHERE id = v_inventory.id;

    INSERT INTO public.inventory_reservations (
      order_id,
      user_id,
      product_id,
      store_id,
      qty,
      status,
      expires_at,
      reservation_key,
      source
    )
    VALUES (
      v_order_id,
      p_user_id,
      v_product_id,
      v_store_id,
      v_qty,
      'reserved',
      v_expires_at,
      v_order_id::text || ':' || v_product_id::text || ':' || v_store_id::text,
      'checkout'
    );

    v_line_total := ROUND((v_product.price * v_qty)::numeric, 2);
    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      sku,
      name,
      image,
      qty,
      unit_price,
      line_total,
      warehouse_code
    )
    VALUES (
      v_order_id,
      v_product_id,
      v_product.sku,
      v_product.name,
      v_product.image,
      v_qty,
      v_product.price,
      v_line_total,
      v_store_id::text
    );

    v_reservations := v_reservations || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'sku', v_product.sku,
      'store_id', v_store_id,
      'qty', v_qty,
      'expires_at', v_expires_at
    ));
  END LOOP;

  IF v_fulfillment = 'delivery' THEN
    SELECT *
    INTO v_shipping_method
    FROM public.shipping_methods
    WHERE is_active = true
      AND type = 'delivery'
    ORDER BY sort_order NULLS LAST, base_price ASC
    LIMIT 1;

    IF FOUND THEN
      v_shipping := CASE
        WHEN v_shipping_method.free_from IS NOT NULL AND v_subtotal >= v_shipping_method.free_from THEN 0
        ELSE COALESCE(v_shipping_method.base_price, 0)
      END;
    END IF;
  END IF;

  v_tax := ROUND((v_subtotal * 0.12)::numeric, 2);
  v_total := v_subtotal + v_shipping + v_tax;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      shipping = v_shipping,
      tax = v_tax,
      total = v_total,
      items = v_lines
  WHERE id = v_order_id;

  INSERT INTO public.payments (
    order_id,
    provider,
    amount,
    currency,
    status,
    metadata
  )
  VALUES (
    v_order_id,
    v_gateway.provider,
    v_total,
    COALESCE(v_gateway.currency, 'GTQ'),
    'pending',
    jsonb_build_object(
      'gateway_code', v_gateway.code,
      'gateway_name', v_gateway.name,
      'environment', v_gateway.environment,
      'payment_flow', v_payment_flow,
      'source', 'checkout-orchestrator'
    )
  );

  INSERT INTO public.payment_events (
    order_id,
    event_type,
    provider,
    amount,
    currency,
    status,
    payload,
    created_by
  )
  VALUES (
    v_order_id,
    'payment.initiated',
    v_gateway.provider,
    v_total,
    COALESCE(v_gateway.currency, 'GTQ'),
    'pending',
    jsonb_build_object('payment_flow', v_payment_flow),
    p_user_id
  );

  INSERT INTO public.order_status_history (order_id, status, notes, created_by)
  VALUES (
    v_order_id,
    v_order_status,
    'Orden creada con reserva ecommerce temporal',
    p_user_id
  );

  INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
  VALUES (
    'order.created',
    'orders',
    v_order_id::text,
    jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'status', v_order_status,
      'payment_flow', v_payment_flow,
      'invoice_policy', CASE WHEN v_payment_flow = 'card' THEN 'after_payment_approval' ELSE 'after_manual_payment_confirmation' END
    ),
    'pending'
  );

  IF v_payment_flow IN ('bank_transfer', 'pay_in_store') THEN
    UPDATE public.orders
    SET ready_for_sap_at = now()
    WHERE id = v_order_id;

    INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
    VALUES (
      'orders.ready_for_sap',
      'orders',
      v_order_id::text,
      jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'create_invoice', false,
        'reason', v_payment_flow
      ),
      'pending'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', v_order_status,
    'payment_status', v_payment_status,
    'payment_flow', v_payment_flow,
    'reservation_expires_at', v_expires_at,
    'subtotal', v_subtotal,
    'shipping', v_shipping,
    'tax', v_tax,
    'total', v_total,
    'reservations', v_reservations
  );
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
  v_order_id UUID := NULLIF(p_payload->>'order_id', '')::uuid;
  v_idempotency_key TEXT := COALESCE(
    NULLIF(p_payload->>'idempotency_key', ''),
    v_event_type || ':' || COALESCE(v_order_id::text, '') || ':' || COALESCE(p_payload->>'provider_event_id', '')
  );
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

  IF v_event_type IN ('bank_transfer.approved', 'bank_transfer.rejected', 'pickup.payment_confirmed')
    AND NOT public.is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Admin role is required for manual payment transitions';
  END IF;

  INSERT INTO public.idempotency_keys (key, scope, actor_id, status)
  VALUES (v_idempotency_key, 'payment_event', p_actor_user_id, 'processing')
  ON CONFLICT (key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT response_payload
    INTO v_response
    FROM public.idempotency_keys
    WHERE key = v_idempotency_key
      AND status = 'completed';

    IF v_response IS NOT NULL THEN
      RETURN v_response;
    END IF;

    RAISE EXCEPTION 'Duplicate payment event is still processing or failed: %', v_idempotency_key;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', v_order_id;
  END IF;

  IF v_order.user_id <> p_actor_user_id AND NOT public.is_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Not authorized for order %', v_order_id;
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE order_id = v_order_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment row not found for order %', v_order_id;
  END IF;

  INSERT INTO public.payment_events (
    payment_id,
    order_id,
    event_type,
    provider,
    provider_event_id,
    idempotency_key,
    amount,
    currency,
    status,
    payload,
    created_by
  )
  VALUES (
    v_payment.id,
    v_order_id,
    v_event_type,
    v_payment.provider,
    p_payload->>'provider_event_id',
    v_idempotency_key,
    COALESCE((p_payload->>'amount')::numeric, v_payment.amount),
    COALESCE(p_payload->>'currency', v_payment.currency),
    'processed',
    p_payload,
    p_actor_user_id
  );

  IF v_event_type IN ('payment.approved', 'bank_transfer.approved', 'pickup.payment_confirmed') THEN
    UPDATE public.payments
    SET status = 'approved',
        provider_payment_id = COALESCE(p_payload->>'provider_payment_id', provider_payment_id)
    WHERE id = v_payment.id;

    UPDATE public.inventory_reservations
    SET status = 'committed',
        confirmed_at = now()
    WHERE order_id = v_order_id
      AND status = 'reserved';

    UPDATE public.orders
    SET payment_status = 'payment_confirmed',
        status = CASE
          WHEN fulfillment = 'pickup' THEN 'ready_for_pickup'
          ELSE 'fulfillment_pending'
        END,
        payment_confirmed_at = now(),
        ready_for_sap_at = COALESCE(ready_for_sap_at, now())
    WHERE id = v_order_id;

    INSERT INTO public.order_status_history (order_id, status, notes, created_by)
    VALUES (v_order_id, 'payment_confirmed', 'Pago confirmado y reserva ecommerce comprometida', p_actor_user_id);

    INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload, status)
    VALUES
      (
        'orders.ready_for_sap',
        'orders',
        v_order_id::text,
        jsonb_build_object('order_id', v_order_id, 'create_invoice', true, 'idempotency_key', v_idempotency_key || ':sales_order'),
        'pending'
      ),
      (
        'invoice.create_requested',
        'orders',
        v_order_id::text,
        jsonb_build_object('order_id', v_order_id, 'idempotency_key', v_idempotency_key || ':invoice'),
        'pending'
      );
  ELSIF v_event_type IN ('payment.rejected', 'payment.failed', 'bank_transfer.rejected', 'payment.expired') THEN
    PERFORM public.release_order_reservations(v_order_id, CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'released' END);

    UPDATE public.payments
    SET status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'rejected' END
    WHERE id = v_payment.id;

    UPDATE public.orders
    SET payment_status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'rejected' END,
        status = CASE WHEN v_event_type = 'payment.expired' THEN 'expired' ELSE 'payment_rejected' END
    WHERE id = v_order_id;

    INSERT INTO public.order_status_history (order_id, status, notes, created_by)
    VALUES (v_order_id, v_event_type, 'Pago no confirmado; reserva ecommerce liberada', p_actor_user_id);
  ELSE
    RAISE EXCEPTION 'Unsupported payment event %', v_event_type;
  END IF;

  v_response := jsonb_build_object(
    'ok', true,
    'event_type', v_event_type,
    'order_id', v_order_id,
    'idempotency_key', v_idempotency_key
  );

  UPDATE public.idempotency_keys
  SET status = 'completed',
      response_payload = v_response,
      completed_at = now()
  WHERE key = v_idempotency_key;

  RETURN v_response;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.idempotency_keys
  SET status = 'failed',
      response_payload = jsonb_build_object('ok', false, 'error', SQLERRM),
      completed_at = now()
  WHERE key = v_idempotency_key;
  RAISE;
END;
$$;

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
CREATE POLICY "Admins manage inventory reservations"
  ON public.inventory_reservations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own reservations" ON public.inventory_reservations;
CREATE POLICY "Users read own reservations"
  ON public.inventory_reservations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage order status" ON public.order_status_history;
CREATE POLICY "Admins manage order status"
  ON public.order_status_history FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own order status" ON public.order_status_history;
CREATE POLICY "Users read own order status"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins manage payments" ON public.payments;
CREATE POLICY "Admins manage payments"
  ON public.payments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage payment events" ON public.payment_events;
CREATE POLICY "Admins manage payment events"
  ON public.payment_events FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own payment events" ON public.payment_events;
CREATE POLICY "Users read own payment events"
  ON public.payment_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins manage recovery tasks" ON public.error_recovery_tasks;
CREATE POLICY "Admins manage recovery tasks"
  ON public.error_recovery_tasks FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage idempotency keys" ON public.idempotency_keys;
CREATE POLICY "Admins manage idempotency keys"
  ON public.idempotency_keys FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage sap entity mappings" ON public.sap_entity_mappings;
CREATE POLICY "Admins manage sap entity mappings"
  ON public.sap_entity_mappings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage integration queue" ON public.integration_event_queue;
CREATE POLICY "Admins manage integration queue"
  ON public.integration_event_queue FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage price lists" ON public.admin_price_lists;
CREATE POLICY "Admins manage price lists"
  ON public.admin_price_lists FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage price list items" ON public.admin_price_list_items;
CREATE POLICY "Admins manage price list items"
  ON public.admin_price_list_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage customer accounts" ON public.customer_accounts;
CREATE POLICY "Admins manage customer accounts"
  ON public.customer_accounts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage payment gateways" ON public.payment_gateways;
CREATE POLICY "Admins manage payment gateways"
  ON public.payment_gateways FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read sap logs" ON public.sap_sync_logs;
CREATE POLICY "Admins read sap logs"
  ON public.sap_sync_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admins manage invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.checkout_create_order(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_inventory_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_reservations(UUID, TEXT) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.idempotency_keys,
  public.payment_events,
  public.error_recovery_tasks,
  public.sap_entity_mappings
TO authenticated;

GRANT ALL ON
  public.idempotency_keys,
  public.payment_events,
  public.error_recovery_tasks,
  public.sap_entity_mappings
TO service_role;
