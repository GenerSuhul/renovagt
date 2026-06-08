-- Renova Cloud MVP lightweight mode.
--
-- Goal: keep SAP integration and ecommerce/admin flows usable on a small
-- Supabase Cloud project by removing bulky operational logs and compacting
-- raw SAP payloads that are not needed for storefront/admin reads.

CREATE OR REPLACE FUNCTION public.renova_mvp_compact_operational_data(
  p_keep_sap_events INTEGER DEFAULT 1000,
  p_keep_recovery_tasks INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_sap_events INTEGER := 0;
  v_deleted_recovery_tasks INTEGER := 0;
  v_deleted_idempotency_keys INTEGER := 0;
  v_compacted_products INTEGER := 0;
  v_compacted_prices INTEGER := 0;
  v_compacted_inventory INTEGER := 0;
BEGIN
  IF to_regclass('public.sap_events') IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             row_number() OVER (ORDER BY COALESCE(processed_at, received_at, event_timestamp, now()) DESC, id DESC) AS rn
      FROM public.sap_events
    )
    DELETE FROM public.sap_events se
    USING ranked r
    WHERE se.id = r.id
      AND r.rn > GREATEST(p_keep_sap_events, 0);
    GET DIAGNOSTICS v_deleted_sap_events = ROW_COUNT;

    UPDATE public.sap_events
    SET payload = jsonb_build_object(
          'event_type', event_type,
          'source', source,
          'correlation_id', correlation_id,
          'idempotency_key', idempotency_key,
          'payload_count', payload_count,
          'expected_rows', expected_rows
        ),
        results = CASE
          WHEN jsonb_typeof(COALESCE(results, '[]'::jsonb)) = 'array'
          THEN (
            SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
            FROM (
              SELECT value
              FROM jsonb_array_elements(results) WITH ORDINALITY e(value, ord)
              ORDER BY ord
              LIMIT 5
            ) s
          )
          ELSE '[]'::jsonb
        END,
        sample_errors = CASE
          WHEN jsonb_typeof(COALESCE(sample_errors, '[]'::jsonb)) = 'array'
          THEN (
            SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
            FROM (
              SELECT value
              FROM jsonb_array_elements(sample_errors) WITH ORDINALITY e(value, ord)
              ORDER BY ord
              LIMIT 20
            ) s
          )
          ELSE '[]'::jsonb
        END;
  END IF;

  IF to_regclass('public.error_recovery_tasks') IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             row_number() OVER (ORDER BY COALESCE(created_at, now()) DESC, id DESC) AS rn
      FROM public.error_recovery_tasks
      WHERE COALESCE(status, '') IN ('resolved', 'closed', 'ignored', 'done')
    )
    DELETE FROM public.error_recovery_tasks ert
    USING ranked r
    WHERE ert.id = r.id
      AND r.rn > GREATEST(p_keep_recovery_tasks, 0);
    GET DIAGNOSTICS v_deleted_recovery_tasks = ROW_COUNT;
  END IF;

  IF to_regclass('public.idempotency_keys') IS NOT NULL THEN
    DELETE FROM public.idempotency_keys
    WHERE COALESCE(updated_at, created_at, now()) < now() - interval '3 days'
      AND COALESCE(status, '') IN ('completed', 'failed', 'expired');
    GET DIAGNOSTICS v_deleted_idempotency_keys = ROW_COUNT;
  END IF;

  IF to_regclass('public.sap_sync_logs') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.sap_sync_logs';
  END IF;

  IF to_regclass('public.payment_events') IS NOT NULL THEN
    DELETE FROM public.payment_events
    WHERE COALESCE(created_at, now()) < now() - interval '7 days';
  END IF;

  IF to_regclass('public.products') IS NOT NULL THEN
    UPDATE public.products
    SET sap_raw_payload = '{}'::jsonb,
        metadata = COALESCE(metadata, '{}'::jsonb) - 'raw' - 'sap_raw' - 'payload'
    WHERE COALESCE(sap_raw_payload, '{}'::jsonb) <> '{}'::jsonb
       OR COALESCE(metadata, '{}'::jsonb) ?| ARRAY['raw', 'sap_raw', 'payload'];
    GET DIAGNOSTICS v_compacted_products = ROW_COUNT;
  END IF;

  IF to_regclass('public.product_prices') IS NOT NULL THEN
    UPDATE public.product_prices
    SET payload = '{}'::jsonb
    WHERE COALESCE(payload, '{}'::jsonb) <> '{}'::jsonb;
    GET DIAGNOSTICS v_compacted_prices = ROW_COUNT;
  END IF;

  IF to_regclass('public.inventory_by_store') IS NOT NULL THEN
    UPDATE public.inventory_by_store
    SET payload = '{}'::jsonb
    WHERE COALESCE(payload, '{}'::jsonb) <> '{}'::jsonb;
    GET DIAGNOSTICS v_compacted_inventory = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_sap_events', v_deleted_sap_events,
    'deleted_recovery_tasks', v_deleted_recovery_tasks,
    'deleted_idempotency_keys', v_deleted_idempotency_keys,
    'compacted_products', v_compacted_products,
    'compacted_prices', v_compacted_prices,
    'compacted_inventory', v_compacted_inventory
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.renova_mvp_compact_operational_data(INTEGER, INTEGER) TO service_role;

-- Run once when this migration is applied.
SELECT public.renova_mvp_compact_operational_data(500, 200);

-- Keep the SAP-to-ecommerce gate closed for the MVP until invoice/order SAP
-- flows are manually verified.
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value, description)
VALUES (
  'orders_ready_for_sap_enabled',
  'false'::jsonb,
  'MVP safety gate: do not expose orders.ready_for_sap until SAP document flow is verified'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();
