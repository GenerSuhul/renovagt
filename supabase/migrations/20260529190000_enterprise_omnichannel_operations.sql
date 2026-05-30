-- Enterprise omnichannel extensions for RENOVA.
-- This migration prepares the database for product media, advanced inventory,
-- FORZA logistics, SAP event queues, invoices, CRM, marketing, notifications,
-- and auditability. It avoids direct SAP access from the frontend.

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.category_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  image_type TEXT NOT NULL DEFAULT 'banner' CHECK (image_type IN ('banner', 'mobile_banner', 'thumbnail')),
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  image_type TEXT NOT NULL DEFAULT 'logo' CHECK (image_type IN ('logo', 'banner')),
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotional_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  target_url TEXT,
  placement TEXT NOT NULL DEFAULT 'home_slider',
  branch_id UUID REFERENCES public.stores(id),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depth_cm NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volumetric_weight NUMERIC(10,3) GENERATED ALWAYS AS ((width_cm * height_cm * depth_cm) / 5000) STORED,
  ADD COLUMN IF NOT EXISTS package_type TEXT,
  ADD COLUMN IF NOT EXISTS shipping_classification TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tax_classification TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS manual_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(12,2),
  image_id UUID REFERENCES public.product_images(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  related_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('related', 'upsell', 'cross_sell')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, related_product_id, relation_type)
);

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS on_hand INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_ecommerce INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incoming INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available INTEGER GENERATED ALWAYS AS (GREATEST(on_hand - committed - reserved_ecommerce, 0)) STORED;

UPDATE public.inventory
SET on_hand = GREATEST(qty, on_hand)
WHERE on_hand = 0 AND qty > 0;

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'released', 'committed', 'expired')),
  expires_at TIMESTAMPTZ,
  sap_sync_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_store_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id TEXT,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sap_doc_num TEXT,
  ADD COLUMN IF NOT EXISTS sap_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sap_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forza_tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_status TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'single' CHECK (fulfillment_mode IN ('single', 'split', 'mixed')),
  ADD COLUMN IF NOT EXISTS scheduled_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fraud_review_status TEXT DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  origin_store_id UUID REFERENCES public.stores(id),
  shipping_method_id UUID REFERENCES public.shipping_methods(id),
  carrier TEXT NOT NULL DEFAULT 'FORZA',
  status TEXT NOT NULL DEFAULT 'pending',
  tracking_code TEXT,
  label_url TEXT,
  quote_amount NUMERIC(12,2),
  weight_kg NUMERIC(10,3),
  volumetric_weight NUMERIC(10,3),
  package_count INTEGER NOT NULL DEFAULT 1,
  destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integration_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sap_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES public.integration_event_queue(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('sap_to_renova', 'renova_to_sap')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL DEFAULT 'consumer' CHECK (invoice_type IN ('consumer', 'business')),
  tax_identifier TEXT,
  invoice_status TEXT NOT NULL DEFAULT 'pending',
  sap_invoice_docentry INTEGER,
  sap_invoice_docnum TEXT,
  invoice_pdf_url TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_activity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  channel TEXT NOT NULL DEFAULT 'web',
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  budget NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coupon_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL,
  min_order_total NUMERIC(12,2),
  usage_limit INTEGER,
  target_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID REFERENCES public.carts(id) ON DELETE CASCADE,
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE SET NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  recovery_sent_at TIMESTAMPTZ,
  recovered_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_account_id UUID REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'push', 'in_app')),
  event_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enqueue_integration_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.integration_event_queue (event_type, aggregate_type, aggregate_id, payload)
  VALUES (TG_ARGV[0], TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_order_created ON public.orders;
CREATE TRIGGER enqueue_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_integration_event('order.created');

DROP TRIGGER IF EXISTS enqueue_inventory_changed ON public.inventory;
CREATE TRIGGER enqueue_inventory_changed
  AFTER INSERT OR UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_integration_event('inventory.changed');

DROP TRIGGER IF EXISTS enqueue_payment_gateway_changed ON public.payment_gateways;
CREATE TRIGGER enqueue_payment_gateway_changed
  AFTER INSERT OR UPDATE ON public.payment_gateways
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_integration_event('payment_gateway.changed');

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_store_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_event_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activity_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product media" ON public.product_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read category media" ON public.category_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read brand media" ON public.brand_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read active banners" ON public.promotional_banners FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "Authenticated manage product media" ON public.product_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage category media" ON public.category_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage brand media" ON public.brand_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage banners" ON public.promotional_banners FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage enterprise tables" ON public.product_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage product relations" ON public.product_relations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage inventory reservations" ON public.inventory_reservations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Own store preferences" ON public.customer_store_preferences FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated manage order status" ON public.order_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage shipments" ON public.shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage shipment history" ON public.shipment_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage integration queue" ON public.integration_event_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage sap logs" ON public.sap_sync_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage invoices" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage invoice items" ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage invoice status" ON public.invoice_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage crm timeline" ON public.crm_activity_timeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage tickets" ON public.support_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage campaigns" ON public.marketing_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage coupons" ON public.coupon_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage abandoned carts" ON public.abandoned_carts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage notifications" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT ON
  public.product_images,
  public.category_images,
  public.brand_images,
  public.promotional_banners
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.product_images,
  public.category_images,
  public.brand_images,
  public.promotional_banners,
  public.product_variants,
  public.product_relations,
  public.inventory_reservations,
  public.customer_store_preferences,
  public.order_status_history,
  public.shipments,
  public.shipment_history,
  public.integration_event_queue,
  public.sap_sync_logs,
  public.invoices,
  public.invoice_items,
  public.invoice_status_history,
  public.crm_activity_timeline,
  public.support_tickets,
  public.marketing_campaigns,
  public.coupon_rules,
  public.abandoned_carts,
  public.notifications,
  public.audit_logs
TO authenticated;

GRANT ALL ON
  public.product_images,
  public.category_images,
  public.brand_images,
  public.promotional_banners,
  public.product_variants,
  public.product_relations,
  public.inventory_reservations,
  public.customer_store_preferences,
  public.order_status_history,
  public.shipments,
  public.shipment_history,
  public.integration_event_queue,
  public.sap_sync_logs,
  public.invoices,
  public.invoice_items,
  public.invoice_status_history,
  public.crm_activity_timeline,
  public.support_tickets,
  public.marketing_campaigns,
  public.coupon_rules,
  public.abandoned_carts,
  public.notifications,
  public.audit_logs
TO service_role;

INSERT INTO public.marketing_campaigns (name, campaign_type, status, target_rules)
VALUES
  ('Home slider temporada', 'homepage_banner', 'active', '{"placement":"home_slider"}'),
  ('Carritos abandonados', 'abandoned_cart', 'draft', '{"delay_hours":2}'),
  ('Contratistas B2B', 'segment_campaign', 'draft', '{"segment":"b2b"}')
ON CONFLICT DO NOTHING;
