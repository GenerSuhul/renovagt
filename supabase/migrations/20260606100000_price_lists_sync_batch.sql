-- Adds the OPLN price list sync event used by the SAP B1 middleware.
-- This is intentionally separate from catalog.prices.upsert: OPLN manages
-- the list metadata; ItemPrices manages SKU prices inside each list.

CREATE OR REPLACE FUNCTION public.sap_bulk_upsert_price_lists(
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
  v_sample_errors JSONB := '[]'::jsonb;
BEGIN
  DROP TABLE IF EXISTS _sap_price_list_rows;
  CREATE TEMP TABLE _sap_price_list_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    COALESCE(
      NULLIF(public.sap_jsonb_text(value, ARRAY['code', 'Code']), ''),
      NULLIF(public.sap_jsonb_text(value, ARRAY['price_list_no', 'PriceListNo', 'list_num', 'ListNum', 'price_list', 'PriceList'], ''), '')
    ) AS code,
    COALESCE(
      NULLIF(public.sap_jsonb_text(value, ARRAY['name', 'Name', 'list_name', 'ListName', 'price_list_name', 'PriceListName'], ''), ''),
      NULLIF(public.sap_jsonb_text(value, ARRAY['price_list_no', 'PriceListNo', 'list_num', 'ListNum', 'price_list', 'PriceList'], ''), '')
    ) AS name,
    CASE
      WHEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all')) IN ('b2b','b2c','all')
        THEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'all'))
      ELSE 'all'
    END AS customer_type,
    CASE
      WHEN public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ') = 'QTZ' THEN 'GTQ'
      ELSE public.sap_jsonb_text(value, ARRAY['currency', 'Currency'], 'GTQ')
    END AS currency,
    GREATEST(public.sap_jsonb_number(value, ARRAY['priority', 'Priority', 'list_num', 'ListNum', 'price_list_no', 'PriceListNo'], 0), 0)::INTEGER AS priority,
    public.sap_jsonb_bool(value, ARRAY['is_active', 'IsActive', 'active', 'Active', 'validFor', 'ValidFor'], true) AS is_active
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) = 'array' THEN COALESCE(p_rows, '[]'::jsonb) ELSE jsonb_build_array(p_rows) END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_price_list_rows;

  DROP TABLE IF EXISTS _sap_price_list_valid;
  CREATE TEMP TABLE _sap_price_list_valid ON COMMIT DROP AS
  SELECT DISTINCT ON (code) *
  FROM _sap_price_list_rows
  WHERE NULLIF(code, '') IS NOT NULL
    AND lower(code) NOT IN (',', 'null', 'undefined')
  ORDER BY code, row_index DESC;

  DROP TABLE IF EXISTS _sap_price_list_invalid;
  CREATE TEMP TABLE _sap_price_list_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_price_list_rows
  WHERE NOT (NULLIF(code, '') IS NOT NULL AND lower(code) NOT IN (',', 'null', 'undefined'));

  SELECT count(*) INTO v_processed FROM _sap_price_list_valid;
  SELECT count(*) INTO v_skipped FROM _sap_price_list_invalid;

  INSERT INTO public.price_lists (code, name, customer_type, currency, status, is_active, priority, source, payload)
  SELECT
    code,
    COALESCE(NULLIF(name, ''), code),
    customer_type,
    currency,
    CASE WHEN is_active THEN 'active' ELSE 'inactive' END,
    is_active,
    priority,
    'sap_b1_middleware',
    row
  FROM _sap_price_list_valid
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      priority = EXCLUDED.priority,
      source = EXCLUDED.source,
      payload = EXCLUDED.payload,
      updated_at = now();

  INSERT INTO public.admin_price_lists (code, name, customer_type, currency, priority, is_active)
  SELECT
    code,
    COALESCE(NULLIF(name, ''), code),
    customer_type,
    currency,
    priority,
    is_active
  FROM _sap_price_list_valid
  ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      customer_type = EXCLUDED.customer_type,
      currency = EXCLUDED.currency,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      updated_at = now();

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
      'sap_price_list_skipped',
      'price_lists.sync.batch',
      row_index::TEXT,
      p_idempotency_key,
      p_correlation_id,
      'Skipped SAP price list row: invalid price list code',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Lista de precios SAP omitida',
      'invalid_price_list_code',
      row
    FROM _sap_price_list_invalid;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'invalid_price_list_code',
        'index', row_index,
        'error', 'Missing or invalid price list code'
      )
      ORDER BY row_index
    ),
    '[]'::jsonb
  )
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_price_list_invalid ORDER BY row_index LIMIT 20) s;

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
        'action', 'bulk_upsert_price_lists',
        'processed', v_processed,
        'skipped', v_skipped
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_price_lists(JSONB, TEXT, TEXT) TO service_role;
