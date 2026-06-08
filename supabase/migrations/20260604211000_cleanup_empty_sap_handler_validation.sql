-- Remove zero-row validation events used to verify the production handler.
DELETE FROM public.sap_events
WHERE idempotency_key LIKE 'codex-empty-%'
   OR correlation_id LIKE 'codex-empty-%';
