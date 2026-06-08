-- Safe public read model for checkout payment choices.
-- The admin table can keep secret_key_ref and operational fields behind admin RLS.
DROP VIEW IF EXISTS public.ecommerce_payment_gateways;

CREATE VIEW public.ecommerce_payment_gateways
WITH (security_invoker = false) AS
SELECT
  id,
  code,
  name,
  provider,
  environment,
  status,
  currency,
  supports_installments,
  webhook_url,
  created_at
FROM public.payment_gateways
WHERE status = 'active';

GRANT SELECT ON public.ecommerce_payment_gateways TO anon, authenticated;
