CREATE TABLE IF NOT EXISTS public.admin_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'b2c' CHECK (customer_type IN ('b2c', 'b2b', 'all')),
  currency TEXT NOT NULL DEFAULT 'GTQ',
  priority INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES public.admin_price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  min_qty INTEGER NOT NULL DEFAULT 1 CHECK (min_qty >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(price_list_id, product_id, min_qty)
);

CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_type TEXT NOT NULL DEFAULT 'b2c' CHECK (account_type IN ('b2c', 'b2b')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'blocked')),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  tax_id TEXT,
  company_name TEXT,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_list_id UUID REFERENCES public.admin_price_lists(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, account_type)
);

CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'delivery' CHECK (type IN ('delivery', 'pickup')),
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  free_from NUMERIC(12,2),
  estimated_days TEXT NOT NULL DEFAULT '24-72h',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_shipping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shipping_method_id UUID NOT NULL REFERENCES public.shipping_methods(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  requires_quote BOOLEAN NOT NULL DEFAULT false,
  max_qty_per_order INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, shipping_method_id)
);

CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production', 'local')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'testing')),
  currency TEXT NOT NULL DEFAULT 'GTQ',
  supports_installments BOOLEAN NOT NULL DEFAULT false,
  public_key TEXT,
  secret_key_ref TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_shipping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated admin price lists CRUD" ON public.admin_price_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated admin price list items CRUD" ON public.admin_price_list_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated customer accounts CRUD" ON public.customer_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read active shipping methods" ON public.shipping_methods FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Authenticated shipping methods CRUD" ON public.shipping_methods FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read product shipping rules" ON public.product_shipping_rules FOR SELECT TO anon, authenticated USING (is_enabled = true);
CREATE POLICY "Authenticated product shipping rules CRUD" ON public.product_shipping_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated payment gateways CRUD" ON public.payment_gateways FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.shipping_methods, public.product_shipping_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.admin_price_lists,
  public.admin_price_list_items,
  public.customer_accounts,
  public.shipping_methods,
  public.product_shipping_rules,
  public.payment_gateways
TO authenticated;
GRANT ALL ON
  public.admin_price_lists,
  public.admin_price_list_items,
  public.customer_accounts,
  public.shipping_methods,
  public.product_shipping_rules,
  public.payment_gateways
TO service_role;

INSERT INTO public.admin_price_lists (code, name, customer_type, priority) VALUES
  ('B2C-GENERAL', 'Precio público general', 'b2c', 10),
  ('B2B-CONTRATISTA', 'Contratistas y compras por volumen', 'b2b', 20),
  ('PROMO-TEMPORADA', 'Promoción de temporada', 'all', 30)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, customer_type = EXCLUDED.customer_type, priority = EXCLUDED.priority;

INSERT INTO public.shipping_methods (code, name, type, base_price, free_from, estimated_days) VALUES
  ('DELIVERY-GT', 'Envío Guatemala ciudad', 'delivery', 45, 500, '24-48h'),
  ('DELIVERY-DEP', 'Envío departamental', 'delivery', 75, 900, '48-72h'),
  ('PICKUP-STORE', 'Retiro en tienda', 'pickup', 0, 0, 'Mismo día')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, base_price = EXCLUDED.base_price, free_from = EXCLUDED.free_from, estimated_days = EXCLUDED.estimated_days;

INSERT INTO public.payment_gateways (code, name, provider, environment, status, supports_installments) VALUES
  ('BAC-VISANET', 'BAC / Visanet', 'visanet', 'production', 'active', true),
  ('RECURRENTE', 'Recurrente', 'recurrente', 'sandbox', 'testing', true),
  ('COD', 'Pago contra entrega', 'manual', 'local', 'active', false)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider, environment = EXCLUDED.environment, status = EXCLUDED.status, supports_installments = EXCLUDED.supports_installments;
