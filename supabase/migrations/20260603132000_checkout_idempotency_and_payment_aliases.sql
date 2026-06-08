-- MVP hardening: checkout idempotency and explicit manual-payment aliases.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'checkout_create_order'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'checkout_create_order_impl'
  ) THEN
    ALTER FUNCTION public.checkout_create_order(UUID, JSONB) RENAME TO checkout_create_order_impl;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_payment_event'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_payment_event_impl'
  ) THEN
    ALTER FUNCTION public.apply_payment_event(UUID, JSONB) RENAME TO apply_payment_event_impl;
  END IF;
END $$;

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
  v_idempotency_key TEXT := NULLIF(p_payload->>'idempotency_key', '');
  v_response JSONB;
  v_inserted INTEGER := 0;
BEGIN
  IF v_idempotency_key IS NULL THEN
    RETURN public.checkout_create_order_impl(p_user_id, p_payload);
  END IF;

  INSERT INTO public.idempotency_keys (key, scope, actor_id, status, locked_at)
  VALUES (v_idempotency_key, 'checkout_order', p_user_id, 'processing', now())
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

    RAISE EXCEPTION 'Checkout request is already processing for idempotency_key %', v_idempotency_key;
  END IF;

  v_response := public.checkout_create_order_impl(p_user_id, p_payload);

  UPDATE public.idempotency_keys
  SET status = 'completed',
      response_payload = v_response,
      completed_at = now()
  WHERE key = v_idempotency_key;

  RETURN v_response;
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
  v_original_event TEXT := COALESCE(p_payload->>'event_type', p_payload->>'event');
  v_order_id TEXT := COALESCE(p_payload->>'order_id', '');
  v_payload JSONB := p_payload;
  v_response JSONB;
BEGIN
  IF v_original_event IN ('cash_on_delivery.confirmed', 'cod.payment_confirmed', 'store.payment_confirmed') THEN
    v_payload := jsonb_set(v_payload, '{event_type}', to_jsonb('pickup.payment_confirmed'::text), true);
    v_payload := jsonb_set(v_payload, '{original_event_type}', to_jsonb(v_original_event), true);

    IF NULLIF(v_payload->>'idempotency_key', '') IS NULL THEN
      v_payload := jsonb_set(
        v_payload,
        '{idempotency_key}',
        to_jsonb(v_original_event || ':' || v_order_id || ':' || COALESCE(p_payload->>'provider_event_id', 'manual')),
        true
      );
    END IF;
  END IF;

  v_response := public.apply_payment_event_impl(p_actor_user_id, v_payload);

  IF v_original_event IN ('cash_on_delivery.confirmed', 'cod.payment_confirmed', 'store.payment_confirmed') THEN
    RETURN v_response || jsonb_build_object(
      'event_type', v_original_event,
      'normalized_event_type', 'pickup.payment_confirmed'
    );
  END IF;

  RETURN v_response;
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_create_order(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_event(UUID, JSONB) TO service_role;
