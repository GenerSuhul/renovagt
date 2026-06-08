-- SAP can refresh technical/raw product data, but must not overwrite ecommerce enrichment.
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
    NEW.short_description := OLD.short_description;
    NEW.description := OLD.description;
    NEW.category_id := OLD.category_id;
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

DROP TRIGGER IF EXISTS trg_preserve_enriched_product_fields_on_sap_sync ON public.products;
CREATE TRIGGER trg_preserve_enriched_product_fields_on_sap_sync
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.preserve_enriched_product_fields_on_sap_sync();
