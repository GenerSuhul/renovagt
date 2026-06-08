-- Preserve brand enrichment too; SAP should not overwrite published/enriched merchandising fields.
CREATE OR REPLACE FUNCTION public.preserve_enriched_product_fields_on_sap_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.sap_raw_payload IS DISTINCT FROM OLD.sap_raw_payload
     AND COALESCE(OLD.ecommerce_status, 'draft') NOT IN ('draft', 'needs_enrichment') THEN
    NEW.slug := OLD.slug;
    NEW.name := OLD.name;
    NEW.brand_id := OLD.brand_id;
    NEW.category_id := OLD.category_id;
    NEW.short_description := OLD.short_description;
    NEW.description := OLD.description;
    NEW.image := OLD.image;
    NEW.images := OLD.images;
    NEW.specs := OLD.specs;
    NEW.labels := OLD.labels;
    NEW.ecommerce_status := OLD.ecommerce_status;
    NEW.enrichment_status := OLD.enrichment_status;
    NEW.enrichment_required := OLD.enrichment_required;
  END IF;

  RETURN NEW;
END;
$$;

-- Restore the product touched by the validation request to its SAP brand value seen in the catalog sync.
INSERT INTO public.brands (name, slug)
VALUES ('7', 'sap-7')
ON CONFLICT (name) DO UPDATE
SET slug = COALESCE(public.brands.slug, EXCLUDED.slug);

UPDATE public.products p
SET brand_id = b7.id
FROM public.brands b7
WHERE p.sap_item_code = 'A000014'
  AND b7.name = '7'
  AND EXISTS (
    SELECT 1
    FROM public.brands bt
    WHERE bt.id = p.brand_id
      AND bt.name = 'SAP TEST BRAND'
  );

DELETE FROM public.brands b
WHERE b.name = 'SAP TEST BRAND'
  AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.brand_id = b.id
  );

-- Remove temporary validation artifacts created by Codex smoke tests.
DELETE FROM public.error_recovery_tasks
WHERE idempotency_key LIKE 'codex-%'
   OR correlation_id LIKE 'codex-%'
   OR (payload->>'row_index') IS NOT NULL AND idempotency_key = 'codex-product-bulk-20260604';

DELETE FROM public.pending_price_upserts
WHERE idempotency_key LIKE 'codex-%'
   OR item_code LIKE 'CODEX_%';

DELETE FROM public.sap_events
WHERE idempotency_key LIKE 'codex-%'
   OR correlation_id LIKE 'codex-%';
