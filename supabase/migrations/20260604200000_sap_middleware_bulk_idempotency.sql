-- SAP B1 middleware production hardening:
-- bulk catalog ingestion, pending prices, compact responses and stuck idempotency reclaim.

CREATE OR REPLACE FUNCTION public.sap_slugify(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from regexp_replace(lower(COALESCE(p_value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_text(p_row JSONB, p_keys TEXT[], p_fallback TEXT DEFAULT '')
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key TEXT;
  v_value TEXT;
BEGIN
  FOREACH v_key IN ARRAY p_keys LOOP
    v_value := NULLIF(btrim(p_row ->> v_key), '');
    IF v_value IS NOT NULL THEN
      RETURN v_value;
    END IF;
  END LOOP;
  RETURN COALESCE(p_fallback, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_number(p_row JSONB, p_keys TEXT[], p_fallback NUMERIC DEFAULT 0)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key TEXT;
  v_value TEXT;
BEGIN
  FOREACH v_key IN ARRAY p_keys LOOP
    v_value := NULLIF(btrim(p_row ->> v_key), '');
    IF v_value IS NOT NULL AND v_value ~ '^-?[0-9]+([.][0-9]+)?$' THEN
      RETURN v_value::NUMERIC;
    END IF;
  END LOOP;
  RETURN COALESCE(p_fallback, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_jsonb_bool(p_row JSONB, p_keys TEXT[], p_fallback BOOLEAN DEFAULT true)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_key TEXT;
  v_value TEXT;
BEGIN
  FOREACH v_key IN ARRAY p_keys LOOP
    v_value := lower(NULLIF(btrim(p_row ->> v_key), ''));
    IF v_value IN ('true', 't', 'yes', 'y', '1', 'active', 'activo') THEN
      RETURN true;
    ELSIF v_value IN ('false', 'f', 'no', 'n', '0', 'inactive', 'inactivo') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN COALESCE(p_fallback, true);
END;
$$;

ALTER TABLE public.sap_events
  ADD COLUMN IF NOT EXISTS skipped_rows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_errors JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sap_events
  DROP CONSTRAINT IF EXISTS sap_events_idempotency_key_key;

DROP INDEX IF EXISTS sap_events_active_idempotency_key_key;
CREATE UNIQUE INDEX sap_events_active_idempotency_key_key
  ON public.sap_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status NOT IN ('expired', 'failed');

CREATE TABLE IF NOT EXISTS public.pending_price_upserts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL,
  price_list_code TEXT NOT NULL,
  price_list_name TEXT,
  customer_type TEXT NOT NULL DEFAULT 'all',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GTQ',
  min_qty INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  correlation_id TEXT,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'applied', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_code, price_list_code, min_qty)
);

CREATE INDEX IF NOT EXISTS pending_price_upserts_status_idx
  ON public.pending_price_upserts (status, created_at);

CREATE INDEX IF NOT EXISTS pending_price_upserts_item_code_idx
  ON public.pending_price_upserts (item_code);

DROP TRIGGER IF EXISTS trg_pending_price_upserts_updated ON public.pending_price_upserts;
CREATE TRIGGER trg_pending_price_upserts_updated
  BEFORE UPDATE ON public.pending_price_upserts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pending_price_upserts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pending price upserts" ON public.pending_price_upserts;
CREATE POLICY "Admins manage pending price upserts"
  ON public.pending_price_upserts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_price_upserts TO authenticated;
GRANT ALL ON public.pending_price_upserts TO service_role;

CREATE OR REPLACE FUNCTION public.sap_expire_stuck_sap_events(
  p_prefix TEXT DEFAULT NULL,
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
      processing_error = COALESCE(processing_error, 'Expired stuck SAP middleware event for retry/reclaim'),
      processed_at = COALESCE(processed_at, now())
  WHERE idempotency_key IS NOT NULL
    AND (p_prefix IS NULL OR idempotency_key LIKE p_prefix || '%')
    AND processed_at IS NULL
    AND status IN ('received', 'processing')
    AND received_at < now() - make_interval(secs => GREATEST(COALESCE(p_stuck_after_seconds, 900), 0));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_reclaim_stuck_sap_event(
  p_idempotency_key TEXT,
  p_stuck_after_seconds INTEGER DEFAULT 900
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(p_idempotency_key, '') IS NULL THEN
    RETURN 0;
  END IF;

  RETURN public.sap_expire_stuck_sap_events(p_idempotency_key, p_stuck_after_seconds);
END;
$$;

CREATE OR REPLACE FUNCTION public.sap_replay_pending_prices(p_item_codes TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  INSERT INTO public.admin_price_lists (code, name, customer_type, currency, is_active)
  SELECT DISTINCT
    ppu.price_list_code,
    COALESCE(NULLIF(ppu.price_list_name, ''), ppu.price_list_code),
    CASE WHEN lower(ppu.customer_type) IN ('b2b', 'b2c', 'all') THEN lower(ppu.customer_type) ELSE 'all' END,
    CASE WHEN ppu.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(ppu.currency, 'GTQ') END,
    true
  FROM public.pending_price_upserts ppu
  JOIN public.products p ON p.sap_item_code = ppu.item_code OR p.item_code = ppu.item_code OR p.sku = ppu.item_code
  WHERE ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes))
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      is_active = true;

  INSERT INTO public.admin_price_list_items (price_list_id, product_id, price, min_qty)
  SELECT
    apl.id,
    p.id,
    GREATEST(ppu.price, 0)::NUMERIC(12,2),
    GREATEST(ppu.min_qty, 1)
  FROM public.pending_price_upserts ppu
  JOIN public.products p ON p.sap_item_code = ppu.item_code OR p.item_code = ppu.item_code OR p.sku = ppu.item_code
  JOIN public.admin_price_lists apl ON apl.code = ppu.price_list_code
  WHERE ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes))
  ON CONFLICT (price_list_id, product_id, min_qty) DO UPDATE
  SET price = EXCLUDED.price;

  UPDATE public.products p
  SET price = GREATEST(ppu.price, 0)::NUMERIC(12,2),
      currency = CASE WHEN ppu.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(ppu.currency, 'GTQ') END,
      sap_last_sync_at = now()
  FROM public.pending_price_upserts ppu
  WHERE (p.sap_item_code = ppu.item_code OR p.item_code = ppu.item_code OR p.sku = ppu.item_code)
    AND ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes))
    AND ppu.price_list_code IN ('1', 'B2C', 'B2C-GENERAL');

  UPDATE public.pending_price_upserts ppu
  SET status = 'applied',
      attempt_count = attempt_count + 1,
      last_error = NULL,
      applied_at = now()
  FROM public.products p
  WHERE (p.sap_item_code = ppu.item_code OR p.item_code = ppu.item_code OR p.sku = ppu.item_code)
    AND ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes));

  GET DIAGNOSTICS v_applied = ROW_COUNT;

  SELECT count(*)
  INTO v_remaining
  FROM public.pending_price_upserts
  WHERE status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR item_code = ANY(p_item_codes));

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'remaining', v_remaining
  );
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
  v_replay JSONB := '{}'::jsonb;
  v_item_codes TEXT[];
  v_sample_errors JSONB := '[]'::jsonb;
BEGIN
  DROP TABLE IF EXISTS _sap_product_rows;
  CREATE TEMP TABLE _sap_product_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    public.sap_jsonb_text(value, ARRAY['item_code', 'ItemCode', 'sku', 'SKU']) AS item_code,
    public.sap_jsonb_text(value, ARRAY['item_name', 'ItemName', 'name', 'Name']) AS item_name,
    public.sap_jsonb_text(value, ARRAY['brand', 'Brand', 'brand_code', 'BrandCode']) AS brand_code,
    public.sap_jsonb_text(value, ARRAY['category_code', 'ItemsGroupCode', 'items_group_code', 'category']) AS category_code,
    public.sap_jsonb_text(value, ARRAY['category_name', 'ItemsGroupName', 'items_group_name']) AS category_name
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_product_rows;

  DROP TABLE IF EXISTS _sap_product_valid;
  CREATE TEMP TABLE _sap_product_valid ON COMMIT DROP AS
  SELECT *
  FROM _sap_product_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_product_invalid;
  CREATE TEMP TABLE _sap_product_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_product_rows
  WHERE NOT (
    NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
  );

  SELECT count(*) INTO v_processed FROM _sap_product_valid;
  SELECT count(*) INTO v_skipped FROM _sap_product_invalid;

  INSERT INTO public.brands (name, slug)
  SELECT DISTINCT brand_code, 'sap-' || COALESCE(NULLIF(public.sap_slugify(brand_code), ''), 'brand')
  FROM _sap_product_valid
  WHERE NULLIF(brand_code, '') IS NOT NULL
  ON CONFLICT (name) DO UPDATE
  SET slug = COALESCE(public.brands.slug, EXCLUDED.slug);

  INSERT INTO public.categories (slug, name, sap_group_code, is_active)
  SELECT DISTINCT
    'sap-' || COALESCE(NULLIF(public.sap_slugify(category_code), ''), 'category'),
    COALESCE(NULLIF(category_name, ''), 'Categoria ' || category_code),
    CASE WHEN category_code ~ '^[0-9]+$' THEN category_code::INTEGER ELSE NULL END,
    true
  FROM _sap_product_valid
  WHERE NULLIF(category_code, '') IS NOT NULL
  ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      sap_group_code = COALESCE(EXCLUDED.sap_group_code, public.categories.sap_group_code),
      is_active = true;

  INSERT INTO public.products (
    sku,
    slug,
    name,
    brand_id,
    category_id,
    price,
    currency,
    original_price,
    rating,
    reviews,
    image,
    images,
    description,
    specs,
    labels,
    is_active,
    barcode,
    weight_kg,
    shipping_class,
    sap_item_code,
    sap_sync_status,
    sap_last_sync_at,
    sap_raw_payload,
    ecommerce_status,
    enrichment_status,
    enrichment_required,
    external_id,
    item_code,
    short_description
  )
  SELECT
    v.item_code,
    COALESCE(NULLIF(public.sap_slugify(COALESCE(NULLIF(v.item_name, ''), v.item_code)), ''), 'producto') || '-' || COALESCE(NULLIF(public.sap_slugify(v.item_code), ''), left(md5(v.item_code), 8)),
    COALESCE(NULLIF(v.item_name, ''), v.item_code),
    b.id,
    c.id,
    GREATEST(public.sap_jsonb_number(v.row, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2),
    CASE WHEN public.sap_jsonb_text(v.row, ARRAY['currency', 'Currency'], 'GTQ') = 'QTZ' THEN 'GTQ' ELSE public.sap_jsonb_text(v.row, ARRAY['currency', 'Currency'], 'GTQ') END,
    NULL,
    0,
    0,
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['image', 'Image', 'image_url'], ''), ''), 'https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png'),
    '[]'::jsonb,
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['description', 'Description'], ''), ''), COALESCE(NULLIF(v.item_name, ''), v.item_code)),
    '[]'::jsonb,
    '{}'::TEXT[],
    public.sap_jsonb_bool(v.row, ARRAY['is_active', 'Active', 'valid'], true),
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['barcode', 'BarCode', 'CodeBars'], ''), ''),
    GREATEST(public.sap_jsonb_number(v.row, ARRAY['weight_kg', 'WeightKg', 'SalesUnitWeight'], 0), 0),
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['shipping_class', 'ShippingClass'], 'standard'), ''), 'standard'),
    v.item_code,
    'synced',
    now(),
    v.row,
    'needs_enrichment',
    'needs_enrichment',
    true,
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['external_id', 'ExternalId'], ''), ''), 'SAP-ITEM:' || v.item_code),
    v.item_code,
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['short_description', 'ShortDescription'], ''), '')
  FROM _sap_product_valid v
  LEFT JOIN public.brands b ON b.name = v.brand_code
  LEFT JOIN public.categories c ON c.slug = 'sap-' || COALESCE(NULLIF(public.sap_slugify(v.category_code), ''), 'category')
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

  INSERT INTO public.product_variants (
    product_id,
    sku,
    barcode,
    name,
    attributes,
    price,
    price_delta,
    is_active
  )
  SELECT
    p.id,
    v.item_code,
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['barcode', 'BarCode', 'CodeBars'], ''), ''),
    COALESCE(NULLIF(v.item_name, ''), v.item_code),
    '{}'::jsonb,
    GREATEST(public.sap_jsonb_number(v.row, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2),
    0,
    public.sap_jsonb_bool(v.row, ARRAY['is_active', 'Active', 'valid'], true)
  FROM _sap_product_valid v
  JOIN public.products p ON p.sap_item_code = v.item_code
  ON CONFLICT (sku) DO UPDATE
  SET product_id = EXCLUDED.product_id,
      barcode = EXCLUDED.barcode,
      name = EXCLUDED.name,
      price = EXCLUDED.price,
      is_active = EXCLUDED.is_active;

  IF v_skipped > 0 THEN
    INSERT INTO public.error_recovery_tasks (
      severity,
      status,
      task_type,
      entity_type,
      entity_id,
      idempotency_key,
      correlation_id,
      error_message,
      payload,
      title,
      error,
      request_payload
    )
    SELECT
      'warning',
      'open',
      'sap_product_skipped',
      'catalog.products.upsert',
      row_index::TEXT,
      p_idempotency_key,
      p_correlation_id,
      'Skipped SAP product row: invalid item_code',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Producto SAP omitido',
      'invalid_item_code',
      row
    FROM _sap_product_invalid;
  END IF;

  SELECT array_agg(item_code) INTO v_item_codes FROM _sap_product_valid;
  IF v_item_codes IS NOT NULL THEN
    v_replay := public.sap_replay_pending_prices(v_item_codes);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'invalid_item_code',
        'index', row_index,
        'error', 'Missing or invalid item_code'
      )
      ORDER BY row_index
    ),
    '[]'::jsonb
  )
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_product_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object(
    'ok', true,
    'received', v_received,
    'processed', v_processed,
    'skipped', v_skipped,
    'failed', 0,
    'sample_errors', v_sample_errors,
    'results', jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'action', 'bulk_upsert_products',
        'processed', v_processed,
        'skipped', v_skipped,
        'pending_prices_replay', v_replay
      )
    )
  );
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
  v_invalid INTEGER := 0;
  v_pending INTEGER := 0;
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
    CASE
      WHEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all')) IN ('b2b', 'b2c', 'all')
        THEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all'))
      ELSE 'all'
    END AS customer_type,
    GREATEST(public.sap_jsonb_number(value, ARRAY['price', 'Price'], 0), 0)::NUMERIC(12,2) AS price,
    CASE WHEN public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ') = 'QTZ' THEN 'GTQ' ELSE public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ') END AS currency,
    GREATEST(public.sap_jsonb_number(value, ARRAY['min_qty', 'MinQty'], 1), 1)::INTEGER AS min_qty
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_price_rows;

  DROP TABLE IF EXISTS _sap_price_valid;
  CREATE TEMP TABLE _sap_price_valid ON COMMIT DROP AS
  SELECT *
  FROM _sap_price_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_price_invalid;
  CREATE TEMP TABLE _sap_price_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_price_rows
  WHERE NOT (
    NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
  );

  DROP TABLE IF EXISTS _sap_price_matched;
  CREATE TEMP TABLE _sap_price_matched ON COMMIT DROP AS
  SELECT DISTINCT ON (v.row_index)
    v.*,
    p.id AS product_id
  FROM _sap_price_valid v
  JOIN public.products p ON p.sap_item_code = v.item_code OR p.item_code = v.item_code OR p.sku = v.item_code
  ORDER BY v.row_index, p.created_at DESC;

  DROP TABLE IF EXISTS _sap_price_missing_product;
  CREATE TEMP TABLE _sap_price_missing_product ON COMMIT DROP AS
  SELECT v.*
  FROM _sap_price_valid v
  LEFT JOIN _sap_price_matched m ON m.row_index = v.row_index
  WHERE m.row_index IS NULL;

  SELECT count(*) INTO v_invalid FROM _sap_price_invalid;
  SELECT count(*) INTO v_pending FROM _sap_price_missing_product;
  SELECT count(*) INTO v_processed FROM _sap_price_matched;

  INSERT INTO public.admin_price_lists (code, name, customer_type, currency, is_active)
  SELECT DISTINCT
    price_list_code,
    COALESCE(NULLIF(price_list_name, ''), price_list_code),
    customer_type,
    currency,
    true
  FROM _sap_price_matched
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      is_active = true;

  INSERT INTO public.admin_price_list_items (price_list_id, product_id, price, min_qty)
  SELECT
    apl.id,
    m.product_id,
    m.price,
    m.min_qty
  FROM _sap_price_matched m
  JOIN public.admin_price_lists apl ON apl.code = m.price_list_code
  ON CONFLICT (price_list_id, product_id, min_qty) DO UPDATE
  SET price = EXCLUDED.price;

  UPDATE public.products p
  SET price = m.price,
      currency = m.currency,
      sap_last_sync_at = now()
  FROM _sap_price_matched m
  WHERE p.id = m.product_id
    AND m.price_list_code IN ('1', 'B2C', 'B2C-GENERAL');

  INSERT INTO public.pending_price_upserts (
    item_code,
    price_list_code,
    price_list_name,
    customer_type,
    price,
    currency,
    min_qty,
    payload,
    correlation_id,
    idempotency_key,
    status,
    last_error
  )
  SELECT
    item_code,
    price_list_code,
    COALESCE(NULLIF(price_list_name, ''), price_list_code),
    customer_type,
    price,
    currency,
    min_qty,
    row,
    p_correlation_id,
    p_idempotency_key,
    'pending',
    'product_not_found'
  FROM _sap_price_missing_product
  ON CONFLICT (item_code, price_list_code, min_qty) DO UPDATE
  SET price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      price_list_name = EXCLUDED.price_list_name,
      customer_type = EXCLUDED.customer_type,
      payload = EXCLUDED.payload,
      correlation_id = EXCLUDED.correlation_id,
      idempotency_key = EXCLUDED.idempotency_key,
      status = 'pending',
      last_error = 'product_not_found';

  IF v_invalid > 0 THEN
    INSERT INTO public.error_recovery_tasks (
      severity,
      status,
      task_type,
      entity_type,
      entity_id,
      idempotency_key,
      correlation_id,
      error_message,
      payload,
      title,
      error,
      request_payload
    )
    SELECT
      'warning',
      'open',
      'sap_price_skipped',
      'catalog.prices.upsert',
      row_index::TEXT,
      p_idempotency_key,
      p_correlation_id,
      'Skipped SAP price row: invalid item_code',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Precio SAP omitido',
      'invalid_item_code',
      row
    FROM _sap_price_invalid;
  END IF;

  SELECT COALESCE(jsonb_agg(error_row ORDER BY error_row->>'index'), '[]'::jsonb)
  INTO v_sample_errors
  FROM (
    SELECT jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'invalid_item_code',
      'index', row_index,
      'error', 'Missing or invalid item_code'
    ) AS error_row
    FROM _sap_price_invalid
    UNION ALL
    SELECT jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'product_not_found',
      'index', row_index,
      'item_code', item_code,
      'error', 'Product not found; price staged for replay'
    ) AS error_row
    FROM _sap_price_missing_product
    LIMIT 20
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'received', v_received,
    'processed', v_processed,
    'skipped', v_invalid + v_pending,
    'failed', 0,
    'pending', v_pending,
    'sample_errors', v_sample_errors,
    'results', jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'action', 'bulk_upsert_prices',
        'processed', v_processed,
        'pending', v_pending,
        'skipped', v_invalid + v_pending
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_expire_stuck_sap_events(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_reclaim_stuck_sap_event(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_replay_pending_prices(TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_products(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_prices(JSONB, TEXT, TEXT) TO service_role;

SELECT public.sap_expire_stuck_sap_events(
  'product_sync_20260604013702_6aaf9a97d92a431c83cee4ab8a423ffe',
  0
);
