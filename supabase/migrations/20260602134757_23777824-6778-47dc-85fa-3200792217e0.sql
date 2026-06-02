
-- Unique keys needed for SAP upserts
ALTER TABLE public.products ADD CONSTRAINT products_sap_item_code_key UNIQUE (sap_item_code);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sap_doc_entry_key UNIQUE (sap_doc_entry);

-- Mirror table for SAP Business Partners (B2B/B2C from SAP) decoupled from auth.users
CREATE TABLE public.sap_business_partners (
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

CREATE POLICY "sap bp read auth" ON public.sap_business_partners
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER sap_business_partners_updated_at
  BEFORE UPDATE ON public.sap_business_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track processing status on sap_events (already has processed_at / processing_error)
CREATE INDEX IF NOT EXISTS sap_events_unprocessed_idx
  ON public.sap_events (received_at) WHERE processed_at IS NULL;
