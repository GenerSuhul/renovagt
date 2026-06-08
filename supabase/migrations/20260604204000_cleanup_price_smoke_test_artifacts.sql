DELETE FROM public.pending_price_upserts
WHERE idempotency_key LIKE 'codex-%'
   OR item_code LIKE 'CODEX_%';

DELETE FROM public.error_recovery_tasks
WHERE idempotency_key LIKE 'codex-%'
   OR correlation_id LIKE 'codex-%';

DELETE FROM public.sap_events
WHERE idempotency_key LIKE 'codex-%'
   OR correlation_id LIKE 'codex-%';
