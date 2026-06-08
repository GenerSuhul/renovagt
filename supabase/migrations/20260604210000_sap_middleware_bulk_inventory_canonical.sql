-- SAP B1 middleware production bulk path.
-- Canonical staging tables keep middleware ingestion fast and lossless, while
-- bridge functions feed the existing ecommerce/admin tables.

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.brands
SET code = COALESCE(NULLIF(code, ''), NULLIF(name, ''), NULLIF(slug, ''), id::TEXT);

WITH ranked AS (
  SELECT
    id,
    code,
    row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.brands
  WHERE code IS NOT NULL
)
UPDATE public.brands b
SET code = left(ranked.code || '-' || ranked.rn::TEXT, 120)
FROM ranked
WHERE b.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.brands
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS brands_code_key
  ON public.brands (code);

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.categories
SET code = COALESCE(
  NULLIF(code, ''),
  NULLIF(sap_group_code::TEXT, ''),
  NULLIF(slug, ''),
  NULLIF(name, ''),
  id::TEXT
);

WITH ranked AS (
  SELECT
    id,
    code,
    row_number() OVER (PARTITION BY code ORDER BY created_at, id) AS rn
  FROM public.categories
  WHERE code IS NOT NULL
)
UPDATE public.categories c
SET code = left(ranked.code || '-' || ranked.rn::TEXT, 120)
FROM ranked
WHERE c.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.categories
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_code_key
  ON public.categories (code);

UPDATE public.products
SET item_code = COALESCE(NULLIF(item_code, ''), NULLIF(sap_item_code, ''), NULLIF(sku, ''), id::TEXT),
    sap_item_code = COALESCE(NULLIF(sap_item_code, ''), NULLIF(item_code, ''), NULLIF(sku, ''))
WHERE item_code IS NULL
   OR item_code = ''
   OR sap_item_code IS NULL
   OR sap_item_code = '';

CREATE INDEX IF NOT EXISTS products_item_code_idx
  ON public.products (item_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.products
    WHERE item_code IS NOT NULL
    GROUP BY item_code
    HAVING count(*) > 1
    LIMIT 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS products_item_code_key ON public.products (item_code) WHERE item_code IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idempotency_keys') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_key_idx ON public.idempotency_keys (key)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'all'
    CHECK (customer_type IN ('b2c', 'b2b', 'all')),
  currency TEXT NOT NULL DEFAULT 'GTQ',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.price_lists
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.price_lists
SET code = COALESCE(NULLIF(code, ''), id::TEXT),
    name = COALESCE(NULLIF(name, ''), NULLIF(code, ''), id::TEXT),
    customer_type = CASE WHEN lower(COALESCE(customer_type, 'all')) IN ('b2b', 'b2c', 'all') THEN lower(COALESCE(customer_type, 'all')) ELSE 'all' END,
    currency = CASE WHEN currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(currency, 'GTQ') END,
    status = CASE WHEN lower(COALESCE(status, 'active')) IN ('active', 'inactive', 'archived') THEN lower(COALESCE(status, 'active')) ELSE 'active' END,
    is_active = COALESCE(is_active, true);

WITH ranked AS (
  SELECT
    id,
    code,
    row_number() OVER (PARTITION BY code ORDER BY updated_at DESC, created_at DESC, id) AS rn
  FROM public.price_lists
  WHERE code IS NOT NULL
)
UPDATE public.price_lists pl
SET code = left(ranked.code || '-' || ranked.rn::TEXT, 120)
FROM ranked
WHERE pl.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.price_lists
  ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_code_key
  ON public.price_lists (code);

DROP TRIGGER IF EXISTS trg_price_lists_updated ON public.price_lists;
CREATE TRIGGER trg_price_lists_updated
  BEFORE UPDATE ON public.price_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage price lists canonical" ON public.price_lists;
CREATE POLICY "Admins manage price lists canonical"
  ON public.price_lists FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.price_lists TO authenticated;
GRANT ALL ON public.price_lists TO service_role;

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_prices
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS price_list_code TEXT,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES public.price_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GTQ',
  ADD COLUMN IF NOT EXISTS min_qty INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.product_prices
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN price_list_id DROP NOT NULL;

UPDATE public.product_prices
SET item_code = COALESCE(NULLIF(item_code, ''), id::TEXT),
    price_list_code = COALESCE(NULLIF(price_list_code, ''), '1'),
    currency = CASE WHEN currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(currency, 'GTQ') END,
    min_qty = GREATEST(COALESCE(min_qty, 1), 1),
    customer_type = CASE WHEN lower(COALESCE(customer_type, 'all')) IN ('b2b', 'b2c', 'all') THEN lower(COALESCE(customer_type, 'all')) ELSE 'all' END;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY item_code, price_list_code
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM public.product_prices
  WHERE item_code IS NOT NULL
    AND price_list_code IS NOT NULL
)
DELETE FROM public.product_prices pp
USING ranked
WHERE pp.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.product_prices
  ALTER COLUMN item_code SET NOT NULL,
  ALTER COLUMN price_list_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_prices_item_price_list_key
  ON public.product_prices (item_code, price_list_code);

CREATE INDEX IF NOT EXISTS product_prices_product_id_idx
  ON public.product_prices (product_id);

CREATE INDEX IF NOT EXISTS product_prices_price_list_code_idx
  ON public.product_prices (price_list_code);

DROP TRIGGER IF EXISTS trg_product_prices_updated ON public.product_prices;
CREATE TRIGGER trg_product_prices_updated
  BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage product prices canonical" ON public.product_prices;
CREATE POLICY "Admins manage product prices canonical"
  ON public.product_prices FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;

CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_warehouse_code TEXT NOT NULL,
  branch_code TEXT,
  name TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS sap_warehouse_code TEXT,
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.warehouses
SET sap_warehouse_code = COALESCE(NULLIF(sap_warehouse_code, ''), id::TEXT),
    name = COALESCE(NULLIF(name, ''), NULLIF(sap_warehouse_code, ''), id::TEXT),
    is_active = COALESCE(is_active, true);

WITH ranked AS (
  SELECT
    id,
    sap_warehouse_code,
    row_number() OVER (PARTITION BY sap_warehouse_code ORDER BY updated_at DESC, created_at DESC, id) AS rn
  FROM public.warehouses
  WHERE sap_warehouse_code IS NOT NULL
)
UPDATE public.warehouses w
SET sap_warehouse_code = left(ranked.sap_warehouse_code || '-' || ranked.rn::TEXT, 120)
FROM ranked
WHERE w.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.warehouses
  ALTER COLUMN sap_warehouse_code SET NOT NULL,
  ALTER COLUMN name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_sap_warehouse_code_key
  ON public.warehouses (sap_warehouse_code);

CREATE INDEX IF NOT EXISTS warehouses_store_id_idx
  ON public.warehouses (store_id);

DROP TRIGGER IF EXISTS trg_warehouses_updated ON public.warehouses;
CREATE TRIGGER trg_warehouses_updated
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage warehouses canonical" ON public.warehouses;
CREATE POLICY "Admins manage warehouses canonical"
  ON public.warehouses FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

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
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  correlation_id TEXT,
  idempotency_key TEXT,
  last_sap_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_by_store
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_code TEXT,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_code TEXT,
  ADD COLUMN IF NOT EXISTS on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_ecommerce NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sap_b1_middleware',
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS last_sap_sync_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.inventory_by_store
  ALTER COLUMN product_id DROP NOT NULL,
  ALTER COLUMN warehouse_id DROP NOT NULL,
  ALTER COLUMN store_id DROP NOT NULL;

UPDATE public.inventory_by_store
SET item_code = COALESCE(NULLIF(item_code, ''), id::TEXT),
    warehouse_code = COALESCE(NULLIF(warehouse_code, ''), 'DEFAULT'),
    on_hand = COALESCE(on_hand, 0),
    committed = COALESCE(committed, 0),
    available = COALESCE(available, GREATEST(COALESCE(on_hand, 0) - COALESCE(committed, 0) - COALESCE(reserved_ecommerce, 0) - COALESCE(safety_stock, 0), 0)),
    reserved_ecommerce = COALESCE(reserved_ecommerce, 0),
    safety_stock = COALESCE(safety_stock, 0);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY item_code, warehouse_code
      ORDER BY updated_at DESC, created_at DESC, id
    ) AS rn
  FROM public.inventory_by_store
  WHERE item_code IS NOT NULL
    AND warehouse_code IS NOT NULL
)
DELETE FROM public.inventory_by_store ibs
USING ranked
WHERE ibs.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.inventory_by_store
  ALTER COLUMN item_code SET NOT NULL,
  ALTER COLUMN warehouse_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_by_store_item_warehouse_key
  ON public.inventory_by_store (item_code, warehouse_code);

CREATE INDEX IF NOT EXISTS inventory_by_store_product_id_idx
  ON public.inventory_by_store (product_id);

CREATE INDEX IF NOT EXISTS inventory_by_store_warehouse_code_idx
  ON public.inventory_by_store (warehouse_code);

DROP TRIGGER IF EXISTS trg_inventory_by_store_updated ON public.inventory_by_store;
CREATE TRIGGER trg_inventory_by_store_updated
  BEFORE UPDATE ON public.inventory_by_store
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.inventory_by_store ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage inventory by store canonical" ON public.inventory_by_store;
CREATE POLICY "Admins manage inventory by store canonical"
  ON public.inventory_by_store FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.inventory_by_store TO authenticated;
GRANT ALL ON public.inventory_by_store TO service_role;

CREATE OR REPLACE FUNCTION public.sap_backfill_product_prices(p_item_codes TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied INTEGER := 0;
  v_pending INTEGER := 0;
BEGIN
  UPDATE public.product_prices pp
  SET product_id = p.id
  FROM public.products p
  WHERE (p.sap_item_code = pp.item_code OR p.item_code = pp.item_code OR p.sku = pp.item_code)
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
    AND pp.product_id IS DISTINCT FROM p.id;

  UPDATE public.product_prices pp
  SET price_list_id = pl.id
  FROM public.price_lists pl
  WHERE pl.code = pp.price_list_code
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
    AND pp.price_list_id IS DISTINCT FROM pl.id;

  INSERT INTO public.admin_price_lists (code, name, customer_type, currency, priority, is_active)
  SELECT
    pl.code,
    COALESCE(NULLIF(pl.name, ''), pl.code),
    CASE WHEN lower(COALESCE(pl.customer_type, 'all')) IN ('b2b', 'b2c', 'all') THEN lower(COALESCE(pl.customer_type, 'all')) ELSE 'all' END,
    CASE WHEN pl.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(pl.currency, 'GTQ') END,
    COALESCE(pl.priority, 0),
    pl.is_active AND pl.status = 'active'
  FROM public.price_lists pl
  WHERE EXISTS (
    SELECT 1
    FROM public.product_prices pp
    WHERE pp.price_list_code = pl.code
      AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
  )
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active;

  INSERT INTO public.admin_price_list_items (price_list_id, product_id, price, min_qty)
  SELECT
    apl.id,
    pp.product_id,
    GREATEST(pp.price, 0)::NUMERIC(12,2),
    GREATEST(pp.min_qty, 1)
  FROM public.product_prices pp
  JOIN public.admin_price_lists apl ON apl.code = pp.price_list_code
  WHERE pp.product_id IS NOT NULL
    AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
  ON CONFLICT (price_list_id, product_id, min_qty) DO UPDATE
  SET price = EXCLUDED.price;

  WITH preferred_prices AS (
    SELECT DISTINCT ON (p.id)
      p.id,
      GREATEST(pp.price, 0)::NUMERIC(12,2) AS price,
      CASE WHEN pp.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(pp.currency, 'GTQ') END AS currency
    FROM public.product_prices pp
    JOIN public.products p ON p.id = pp.product_id
    WHERE pp.price_list_code IN ('B2C-GENERAL', 'B2C', '1')
      AND (p_item_codes IS NULL OR pp.item_code = ANY(p_item_codes))
    ORDER BY
      p.id,
      CASE
        WHEN pp.price_list_code = 'B2C-GENERAL' THEN 0
        WHEN pp.price_list_code = 'B2C' THEN 1
        WHEN pp.price_list_code = '1' THEN 2
        ELSE 9
      END,
      pp.updated_at DESC
  )
  UPDATE public.products p
  SET price = preferred_prices.price,
      currency = preferred_prices.currency,
      sap_last_sync_at = now()
  FROM preferred_prices
  WHERE p.id = preferred_prices.id;

  GET DIAGNOSTICS v_applied = ROW_COUNT;

  SELECT count(*)
  INTO v_pending
  FROM public.product_prices
  WHERE product_id IS NULL
    AND (p_item_codes IS NULL OR item_code = ANY(p_item_codes));

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'pending', v_pending
  );
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
  v_applied INTEGER := 0;
  v_pending INTEGER := 0;
BEGIN
  INSERT INTO public.stores (code, name, city, address, phone, hours, is_active)
  SELECT
    w.sap_warehouse_code,
    COALESCE(NULLIF(w.name, ''), 'Bodega ' || w.sap_warehouse_code),
    COALESCE(NULLIF(w.branch_code, ''), ''),
    '',
    '',
    '',
    w.is_active
  FROM public.warehouses w
  WHERE (p_warehouse_codes IS NULL OR w.sap_warehouse_code = ANY(p_warehouse_codes))
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      is_active = EXCLUDED.is_active;

  UPDATE public.warehouses w
  SET store_id = s.id
  FROM public.stores s
  WHERE s.code = w.sap_warehouse_code
    AND (p_warehouse_codes IS NULL OR w.sap_warehouse_code = ANY(p_warehouse_codes))
    AND w.store_id IS DISTINCT FROM s.id;

  UPDATE public.inventory_by_store ibs
  SET product_id = p.id
  FROM public.products p
  WHERE (p.sap_item_code = ibs.item_code OR p.item_code = ibs.item_code OR p.sku = ibs.item_code)
    AND (p_item_codes IS NULL OR ibs.item_code = ANY(p_item_codes))
    AND ibs.product_id IS DISTINCT FROM p.id;

  UPDATE public.inventory_by_store ibs
  SET warehouse_id = w.id,
      store_id = w.store_id
  FROM public.warehouses w
  WHERE w.sap_warehouse_code = ibs.warehouse_code
    AND (p_warehouse_codes IS NULL OR ibs.warehouse_code = ANY(p_warehouse_codes))
    AND (ibs.warehouse_id IS DISTINCT FROM w.id OR ibs.store_id IS DISTINCT FROM w.store_id);

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
    GREATEST(floor(ibs.on_hand), 0)::INTEGER,
    GREATEST(floor(ibs.on_hand), 0)::INTEGER,
    GREATEST(floor(ibs.committed), 0)::INTEGER,
    GREATEST(floor(ibs.reserved_ecommerce), 0)::INTEGER,
    GREATEST(floor(ibs.safety_stock), 0)::INTEGER,
    ibs.last_sap_sync_at,
    now()
  FROM public.inventory_by_store ibs
  WHERE ibs.product_id IS NOT NULL
    AND ibs.store_id IS NOT NULL
    AND (p_item_codes IS NULL OR ibs.item_code = ANY(p_item_codes))
    AND (p_warehouse_codes IS NULL OR ibs.warehouse_code = ANY(p_warehouse_codes))
  ON CONFLICT (product_id, store_id) DO UPDATE
  SET qty = EXCLUDED.qty,
      on_hand = EXCLUDED.on_hand,
      committed = EXCLUDED.committed,
      reserved_ecommerce = EXCLUDED.reserved_ecommerce,
      safety_stock = EXCLUDED.safety_stock,
      last_sap_sync_at = EXCLUDED.last_sap_sync_at,
      updated_at = now();

  GET DIAGNOSTICS v_applied = ROW_COUNT;

  SELECT count(*)
  INTO v_pending
  FROM public.inventory_by_store
  WHERE (product_id IS NULL OR store_id IS NULL)
    AND (p_item_codes IS NULL OR item_code = ANY(p_item_codes))
    AND (p_warehouse_codes IS NULL OR warehouse_code = ANY(p_warehouse_codes));

  RETURN jsonb_build_object(
    'ok', true,
    'applied', v_applied,
    'pending', v_pending
  );
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
  v_backfill JSONB := '{}'::jsonb;
BEGIN
  INSERT INTO public.price_lists (code, name, customer_type, currency, status, is_active, payload)
  SELECT DISTINCT
    ppu.price_list_code,
    COALESCE(NULLIF(ppu.price_list_name, ''), ppu.price_list_code),
    CASE WHEN lower(ppu.customer_type) IN ('b2b', 'b2c', 'all') THEN lower(ppu.customer_type) ELSE 'all' END,
    CASE WHEN ppu.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(ppu.currency, 'GTQ') END,
    'active',
    true,
    jsonb_build_object('source', 'pending_price_upserts')
  FROM public.pending_price_upserts ppu
  WHERE ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes))
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      status = 'active',
      is_active = true;

  INSERT INTO public.product_prices (
    item_code,
    price_list_code,
    price,
    currency,
    min_qty,
    customer_type,
    payload,
    correlation_id,
    idempotency_key
  )
  SELECT
    ppu.item_code,
    ppu.price_list_code,
    GREATEST(ppu.price, 0)::NUMERIC(12,2),
    CASE WHEN ppu.currency = 'QTZ' THEN 'GTQ' ELSE COALESCE(ppu.currency, 'GTQ') END,
    GREATEST(ppu.min_qty, 1),
    CASE WHEN lower(ppu.customer_type) IN ('b2b', 'b2c', 'all') THEN lower(ppu.customer_type) ELSE 'all' END,
    ppu.payload,
    ppu.correlation_id,
    ppu.idempotency_key
  FROM public.pending_price_upserts ppu
  WHERE ppu.status IN ('pending', 'failed')
    AND (p_item_codes IS NULL OR ppu.item_code = ANY(p_item_codes))
  ON CONFLICT (item_code, price_list_code) DO UPDATE
  SET price = EXCLUDED.price,
      currency = EXCLUDED.currency,
      min_qty = EXCLUDED.min_qty,
      customer_type = EXCLUDED.customer_type,
      payload = EXCLUDED.payload,
      correlation_id = EXCLUDED.correlation_id,
      idempotency_key = EXCLUDED.idempotency_key,
      updated_at = now();

  v_backfill := public.sap_backfill_product_prices(p_item_codes);

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
    'remaining', v_remaining,
    'backfill', v_backfill
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
  v_price_replay JSONB := '{}'::jsonb;
  v_inventory_replay JSONB := '{}'::jsonb;
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

  DROP TABLE IF EXISTS _sap_product_upsert;
  CREATE TEMP TABLE _sap_product_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code) *
  FROM _sap_product_valid
  ORDER BY item_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_product_valid;
  SELECT count(*) INTO v_skipped FROM _sap_product_invalid;

  INSERT INTO public.brands (code, name, slug, is_active)
  SELECT DISTINCT
    brand_code,
    brand_code,
    'sap-' || COALESCE(NULLIF(public.sap_slugify(brand_code), ''), 'brand'),
    true
  FROM _sap_product_upsert
  WHERE NULLIF(brand_code, '') IS NOT NULL
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      slug = COALESCE(NULLIF(public.brands.slug, ''), EXCLUDED.slug),
      is_active = true;

  INSERT INTO public.categories (code, slug, name, sap_group_code, is_active)
  SELECT DISTINCT
    category_code,
    'sap-' || COALESCE(NULLIF(public.sap_slugify(category_code), ''), 'category'),
    COALESCE(NULLIF(category_name, ''), 'Categoria ' || category_code),
    CASE WHEN category_code ~ '^[0-9]+$' THEN category_code::INTEGER ELSE NULL END,
    true
  FROM _sap_product_upsert
  WHERE NULLIF(category_code, '') IS NOT NULL
  ON CONFLICT (code) DO UPDATE
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
    public.sap_jsonb_bool(v.row, ARRAY['enrichment_required'], true),
    COALESCE(NULLIF(public.sap_jsonb_text(v.row, ARRAY['external_id', 'ExternalId'], ''), ''), 'SAP-ITEM:' || v.item_code),
    v.item_code,
    NULLIF(public.sap_jsonb_text(v.row, ARRAY['short_description', 'ShortDescription'], ''), '')
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
  FROM _sap_product_upsert v
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

  SELECT array_agg(item_code) INTO v_item_codes FROM _sap_product_upsert;
  IF v_item_codes IS NOT NULL THEN
    v_price_replay := public.sap_replay_pending_prices(v_item_codes);
    v_inventory_replay := public.sap_backfill_inventory_by_store(v_item_codes, NULL);
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
        'price_backfill', v_price_replay,
        'inventory_backfill', v_inventory_replay
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
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(price_list_code, '') IS NOT NULL
    AND lower(price_list_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_price_invalid;
  CREATE TEMP TABLE _sap_price_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_price_rows
  WHERE NOT (
    NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(price_list_code, '') IS NOT NULL
    AND lower(price_list_code) NOT IN (',', 'null', 'undefined')
  );

  DROP TABLE IF EXISTS _sap_price_upsert;
  CREATE TEMP TABLE _sap_price_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code, price_list_code) *
  FROM _sap_price_valid
  ORDER BY item_code, price_list_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_price_valid;
  SELECT count(*) INTO v_invalid FROM _sap_price_invalid;

  INSERT INTO public.price_lists (code, name, customer_type, currency, status, is_active, source)
  SELECT DISTINCT
    price_list_code,
    COALESCE(NULLIF(price_list_name, ''), price_list_code),
    customer_type,
    currency,
    'active',
    true,
    'sap_b1_middleware'
  FROM _sap_price_upsert
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      status = 'active',
      is_active = true,
      updated_at = now();

  INSERT INTO public.product_prices (
    item_code,
    price_list_code,
    product_id,
    price_list_id,
    price,
    currency,
    min_qty,
    customer_type,
    payload,
    correlation_id,
    idempotency_key
  )
  SELECT
    v.item_code,
    v.price_list_code,
    p.id,
    pl.id,
    v.price,
    v.currency,
    v.min_qty,
    v.customer_type,
    v.row,
    p_correlation_id,
    p_idempotency_key
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

  SELECT count(*)
  INTO v_pending
  FROM public.product_prices pp
  WHERE pp.product_id IS NULL
    AND (v_item_codes IS NULL OR pp.item_code = ANY(v_item_codes));

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
      'Skipped SAP price row: invalid item_code or price_list',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Precio SAP omitido',
      'invalid_price_key',
      row
    FROM _sap_price_invalid;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'invalid_price_key',
        'index', row_index,
        'error', 'Missing or invalid item_code or price_list'
      )
      ORDER BY row_index
    ),
    '[]'::jsonb
  )
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_price_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object(
    'ok', true,
    'received', v_received,
    'processed', v_processed,
    'skipped', v_invalid,
    'failed', 0,
    'pending', v_pending,
    'sample_errors', v_sample_errors,
    'results', jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'action', 'bulk_upsert_prices',
        'processed', v_processed,
        'skipped', v_invalid,
        'pending', v_pending,
        'backfill', v_backfill
      )
    )
  );
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
  v_invalid INTEGER := 0;
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
  SELECT *
  FROM _sap_inventory_rows
  WHERE NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(warehouse_code, '') IS NOT NULL
    AND lower(warehouse_code) NOT IN (',', 'null', 'undefined');

  DROP TABLE IF EXISTS _sap_inventory_invalid;
  CREATE TEMP TABLE _sap_inventory_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_inventory_rows
  WHERE NOT (
    NULLIF(item_code, '') IS NOT NULL
    AND lower(item_code) NOT IN (',', 'null', 'undefined')
    AND NULLIF(warehouse_code, '') IS NOT NULL
    AND lower(warehouse_code) NOT IN (',', 'null', 'undefined')
  );

  DROP TABLE IF EXISTS _sap_inventory_upsert;
  CREATE TEMP TABLE _sap_inventory_upsert ON COMMIT DROP AS
  SELECT DISTINCT ON (item_code, warehouse_code) *
  FROM _sap_inventory_valid
  ORDER BY item_code, warehouse_code, row_index DESC;

  SELECT count(*) INTO v_processed FROM _sap_inventory_valid;
  SELECT count(*) INTO v_invalid FROM _sap_inventory_invalid;

  INSERT INTO public.warehouses (sap_warehouse_code, branch_code, name, is_active, payload)
  SELECT DISTINCT
    warehouse_code,
    NULLIF(branch_code, ''),
    COALESCE(NULLIF(warehouse_name, ''), 'Bodega ' || warehouse_code),
    true,
    jsonb_build_object('source', 'inventory.upsert')
  FROM _sap_inventory_upsert
  ON CONFLICT (sap_warehouse_code) DO UPDATE
  SET branch_code = COALESCE(EXCLUDED.branch_code, public.warehouses.branch_code),
      name = COALESCE(NULLIF(EXCLUDED.name, ''), public.warehouses.name),
      is_active = true,
      payload = public.warehouses.payload || EXCLUDED.payload,
      updated_at = now();

  PERFORM public.sap_backfill_inventory_by_store(NULL, ARRAY(SELECT DISTINCT warehouse_code FROM _sap_inventory_upsert));

  INSERT INTO public.inventory_by_store (
    item_code,
    warehouse_code,
    product_id,
    warehouse_id,
    store_id,
    branch_code,
    on_hand,
    committed,
    available,
    reserved_ecommerce,
    safety_stock,
    payload,
    correlation_id,
    idempotency_key,
    last_sap_sync_at
  )
  SELECT
    v.item_code,
    v.warehouse_code,
    p.id,
    w.id,
    w.store_id,
    NULLIF(v.branch_code, ''),
    v.on_hand,
    v.committed,
    CASE
      WHEN v.available > 0 THEN v.available
      ELSE GREATEST(v.on_hand - v.committed - v.reserved_ecommerce - v.safety_stock, 0)
    END,
    v.reserved_ecommerce,
    v.safety_stock,
    v.row,
    p_correlation_id,
    p_idempotency_key,
    now()
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
      payload = EXCLUDED.payload,
      correlation_id = EXCLUDED.correlation_id,
      idempotency_key = EXCLUDED.idempotency_key,
      last_sap_sync_at = EXCLUDED.last_sap_sync_at,
      updated_at = now();

  SELECT array_agg(DISTINCT item_code) INTO v_item_codes FROM _sap_inventory_upsert;
  SELECT array_agg(DISTINCT warehouse_code) INTO v_warehouse_codes FROM _sap_inventory_upsert;
  v_backfill := public.sap_backfill_inventory_by_store(v_item_codes, v_warehouse_codes);

  SELECT count(*)
  INTO v_pending
  FROM public.inventory_by_store ibs
  WHERE (ibs.product_id IS NULL OR ibs.store_id IS NULL)
    AND (v_item_codes IS NULL OR ibs.item_code = ANY(v_item_codes))
    AND (v_warehouse_codes IS NULL OR ibs.warehouse_code = ANY(v_warehouse_codes));

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
      'sap_inventory_skipped',
      'inventory.upsert',
      row_index::TEXT,
      p_idempotency_key,
      p_correlation_id,
      'Skipped SAP inventory row: invalid item_code or warehouse_code',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Inventario SAP omitido',
      'invalid_inventory_key',
      row
    FROM _sap_inventory_invalid;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'invalid_inventory_key',
        'index', row_index,
        'error', 'Missing or invalid item_code or warehouse_code'
      )
      ORDER BY row_index
    ),
    '[]'::jsonb
  )
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_inventory_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object(
    'ok', true,
    'received', v_received,
    'processed', v_processed,
    'skipped', v_invalid,
    'failed', 0,
    'pending', v_pending,
    'sample_errors', v_sample_errors,
    'results', jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'action', 'bulk_upsert_inventory',
        'processed', v_processed,
        'skipped', v_invalid,
        'pending', v_pending,
        'backfill', v_backfill
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_backfill_product_prices(TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_backfill_inventory_by_store(TEXT[], TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_replay_pending_prices(TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_products(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_prices(JSONB, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_inventory(JSONB, TEXT, TEXT) TO service_role;
