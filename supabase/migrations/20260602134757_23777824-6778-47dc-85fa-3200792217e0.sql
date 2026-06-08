-- Unique keys needed for SAP upserts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'sap_item_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_sap_item_code_key'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sap_item_code_key UNIQUE (sap_item_code);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'sap_doc_entry'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_sap_doc_entry_key'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_sap_doc_entry_key UNIQUE (sap_doc_entry);
  END IF;
END $$;

-- Mirror table for SAP Business Partners (B2B/B2C from SAP) decoupled from auth.users.
CREATE TABLE IF NOT EXISTS public.sap_business_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sap_card_code text NOT NULL UNIQUE,
  card_name text,
  customer_type text,
  nit text,
  email text,
  phone text,
  credit_limit numeric,
  price_list text,
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb,
  last_sap_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sap_business_partners TO authenticated;
GRANT ALL ON public.sap_business_partners TO service_role;

ALTER TABLE public.sap_business_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sap bp read auth" ON public.sap_business_partners;
CREATE POLICY "sap bp read auth" ON public.sap_business_partners
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS sap_business_partners_updated_at ON public.sap_business_partners;
CREATE TRIGGER sap_business_partners_updated_at
  BEFORE UPDATE ON public.sap_business_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track processing status on sap_events (already has processed_at / processing_error).
CREATE INDEX IF NOT EXISTS sap_events_unprocessed_idx
  ON public.sap_events (received_at) WHERE processed_at IS NULL;
