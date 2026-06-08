-- Bulk customer ingestion for SAP B1 middleware.
-- Contract: event_type=customers.upsert, payload.data[] up to 400 rows.

ALTER TABLE public.sap_business_partners
  ADD COLUMN IF NOT EXISTS price_list_no TEXT;

CREATE INDEX IF NOT EXISTS sap_business_partners_price_list_no_idx
  ON public.sap_business_partners (price_list_no);

CREATE OR REPLACE FUNCTION public.sap_bulk_upsert_customers(
  p_rows JSONB,
  p_correlation_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS JSONB
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
  DROP TABLE IF EXISTS _sap_customer_rows;
  CREATE TEMP TABLE _sap_customer_rows ON COMMIT DROP AS
  SELECT
    ordinality::INTEGER - 1 AS row_index,
    value AS row,
    NULLIF(public.sap_jsonb_text(value, ARRAY['card_code', 'CardCode', 'sap_card_code'], ''), '') AS card_code,
    NULLIF(public.sap_jsonb_text(value, ARRAY['legal_name', 'LegalName', 'card_name', 'CardName', 'name', 'Name'], ''), '') AS legal_name,
    NULLIF(public.sap_jsonb_text(value, ARRAY['email', 'Email', 'EmailAddress', 'email_address'], ''), '') AS email,
    NULLIF(public.sap_jsonb_text(value, ARRAY['phone', 'Phone', 'Phone1', 'phone1'], ''), '') AS phone,
    CASE
      WHEN lower(public.sap_jsonb_text(value, ARRAY['customer_type', 'CustomerType'], 'b2c')) IN ('b2b', 'business') THEN 'B2B'
      ELSE 'B2C'
    END AS customer_type,
    public.sap_jsonb_number(value, ARRAY['credit_limit', 'CreditLimit'], 0) AS credit_limit,
    NULLIF(public.sap_jsonb_text(value, ARRAY['price_list_no', 'PriceListNo', 'list_num', 'ListNum', 'price_list', 'PriceList'], ''), '') AS price_list_no,
    public.sap_jsonb_bool(value, ARRAY['is_active', 'IsActive', 'active', 'Active', 'validFor', 'ValidFor', 'Valid'], true) AS is_active,
    CASE
      WHEN NULLIF(regexp_replace(upper(public.sap_jsonb_text(value, ARRAY['nit', 'NIT', 'AddID', 'add_id', 'FederalTaxID', 'federal_tax_id', 'LicTradNum', 'lic_trad_num'], '')), '\s+', '', 'g'), '') IS NULL THEN NULL
      WHEN regexp_replace(upper(public.sap_jsonb_text(value, ARRAY['nit', 'NIT', 'AddID', 'add_id', 'FederalTaxID', 'federal_tax_id', 'LicTradNum', 'lic_trad_num'], '')), '\s+', '', 'g') IN ('CF', 'C/F') THEN NULL
      WHEN regexp_replace(upper(public.sap_jsonb_text(value, ARRAY['nit', 'NIT', 'AddID', 'add_id', 'FederalTaxID', 'federal_tax_id', 'LicTradNum', 'lic_trad_num'], '')), '\s+', '', 'g') ~ '^0+$' THEN NULL
      ELSE regexp_replace(upper(public.sap_jsonb_text(value, ARRAY['nit', 'NIT', 'AddID', 'add_id', 'FederalTaxID', 'federal_tax_id', 'LicTradNum', 'lic_trad_num'], '')), '\s+', '', 'g')
    END AS nit
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_rows) = 'array' THEN p_rows
      WHEN p_rows IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(p_rows)
    END
  ) WITH ORDINALITY;

  SELECT count(*) INTO v_received FROM _sap_customer_rows;

  DROP TABLE IF EXISTS _sap_customer_valid;
  CREATE TEMP TABLE _sap_customer_valid ON COMMIT DROP AS
  SELECT DISTINCT ON (card_code) *
  FROM _sap_customer_rows
  WHERE NULLIF(card_code, '') IS NOT NULL
    AND lower(card_code) NOT IN (',', 'null', 'undefined')
  ORDER BY card_code, row_index DESC;

  DROP TABLE IF EXISTS _sap_customer_invalid;
  CREATE TEMP TABLE _sap_customer_invalid ON COMMIT DROP AS
  SELECT *
  FROM _sap_customer_rows
  WHERE NULLIF(card_code, '') IS NULL
    OR lower(card_code) IN (',', 'null', 'undefined');

  SELECT count(*) INTO v_processed FROM _sap_customer_valid;
  SELECT count(*) INTO v_skipped FROM _sap_customer_invalid;

  INSERT INTO public.sap_business_partners (
    sap_card_code,
    card_name,
    customer_type,
    nit,
    email,
    phone,
    credit_limit,
    price_list,
    price_list_no,
    is_active,
    raw,
    last_sap_sync_at
  )
  SELECT
    card_code,
    legal_name,
    customer_type,
    nit,
    email,
    phone,
    credit_limit,
    price_list_no,
    price_list_no,
    is_active,
    row,
    now()
  FROM _sap_customer_valid
  ON CONFLICT (sap_card_code) DO UPDATE
  SET card_name = EXCLUDED.card_name,
      customer_type = EXCLUDED.customer_type,
      nit = EXCLUDED.nit,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      credit_limit = EXCLUDED.credit_limit,
      price_list = EXCLUDED.price_list,
      price_list_no = EXCLUDED.price_list_no,
      is_active = EXCLUDED.is_active,
      raw = EXCLUDED.raw,
      last_sap_sync_at = now(),
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
      'sap_customer_skipped',
      'customers.upsert',
      row_index::TEXT,
      p_idempotency_key,
      p_correlation_id,
      'Skipped SAP customer row: invalid card_code',
      jsonb_build_object('row_index', row_index, 'row', row),
      'Cliente SAP omitido',
      'invalid_card_code',
      row
    FROM _sap_customer_invalid;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ok', true,
        'skipped', true,
        'reason', 'invalid_card_code',
        'index', row_index,
        'card_code', card_code,
        'error', 'Missing or invalid card_code',
        'payload', jsonb_build_object(
          'card_code', card_code,
          'price_list_no', price_list_no,
          'name', legal_name,
          'nit', nit
        )
      )
      ORDER BY row_index
    ),
    '[]'::jsonb
  )
  INTO v_sample_errors
  FROM (SELECT * FROM _sap_customer_invalid ORDER BY row_index LIMIT 20) s;

  RETURN jsonb_build_object(
    'ok', true,
    'event', 'customers.upsert',
    'received', v_received,
    'processed', v_processed,
    'skipped', v_skipped,
    'failed', 0,
    'sample_errors', v_sample_errors,
    'results', jsonb_build_array(
      jsonb_build_object(
        'ok', true,
        'action', 'bulk_upsert_customers',
        'processed_count', v_processed,
        'skipped_count', v_skipped,
        'failed_count', 0,
        'pending_count', 0
      )
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sap_bulk_upsert_customers(JSONB, TEXT, TEXT) TO service_role;
