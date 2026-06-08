-- The legacy stores table was created before updated_at existed, but later
-- migrations attached update_updated_at_column() to it. Inventory bulk upserts
-- can update stores through warehouse mapping, so the trigger needs this column.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.stores
SET updated_at = COALESCE(updated_at, created_at, now());

DROP TRIGGER IF EXISTS trg_stores_updated ON public.stores;
CREATE TRIGGER trg_stores_updated
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
      reserved_ecommerce = EXCLUDED.reserved_ecommerce,
      safety_stock = EXCLUDED.safety_stock,
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

GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_inventory(JSONB, TEXT, TEXT) TO service_role;
