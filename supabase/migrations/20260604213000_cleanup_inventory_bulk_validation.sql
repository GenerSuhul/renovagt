-- Remove temporary inventory validation rows created while fixing inventory.upsert.
DELETE FROM public.inventory
WHERE store_id IN (
  SELECT id FROM public.stores WHERE code = 'CODEX-WH-TEST'
)
OR product_id IN (
  SELECT id FROM public.products WHERE item_code = 'CODEX_INV_TEST' OR sap_item_code = 'CODEX_INV_TEST' OR sku = 'CODEX_INV_TEST'
);

DELETE FROM public.inventory_by_store
WHERE item_code = 'CODEX_INV_TEST'
   OR warehouse_code = 'CODEX-WH-TEST'
   OR idempotency_key LIKE 'codex-inventory-%'
   OR correlation_id LIKE 'codex-inventory-%';

DELETE FROM public.warehouses
WHERE sap_warehouse_code = 'CODEX-WH-TEST';

DELETE FROM public.stores
WHERE code = 'CODEX-WH-TEST';

DELETE FROM public.error_recovery_tasks
WHERE idempotency_key LIKE 'codex-inventory-%'
   OR correlation_id LIKE 'codex-inventory-%'
   OR entity_id IN ('CODEX_INV_TEST', 'CODEX-WH-TEST');

DELETE FROM public.sap_events
WHERE idempotency_key LIKE 'codex-inventory-%'
   OR correlation_id LIKE 'codex-inventory-%';
