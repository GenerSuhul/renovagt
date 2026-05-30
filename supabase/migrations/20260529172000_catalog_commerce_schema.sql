CREATE TABLE IF NOT EXISTS public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT,
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand_id UUID REFERENCES public.brands(id),
  category_id UUID REFERENCES public.categories(id),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  original_price NUMERIC(12,2) CHECK (original_price IS NULL OR original_price >= price),
  rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL,
  specs JSONB NOT NULL DEFAULT '[]'::jsonb,
  labels TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  hours TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, store_id)
);

CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read brands" ON public.brands FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Public read active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Public read active stores" ON public.stores FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Public read inventory" ON public.inventory FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Own carts" ON public.carts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT ON public.brands, public.categories, public.products, public.stores, public.inventory TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.brands, public.categories, public.products, public.stores, public.inventory, public.carts TO service_role;

INSERT INTO public.brands (name) VALUES
  ('DeWalt'), ('Bosch'), ('Makita'), ('Stanley'), ('Sherwin-Williams'), ('Truper'), ('Black+Decker'), ('Philips')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (slug, name, icon, sort_order) VALUES
  ('herramientas', 'Herramientas', 'Wrench', 10),
  ('pintura', 'Pintura', 'PaintBucket', 20),
  ('construccion', 'Construcción', 'HardHat', 30),
  ('electricidad', 'Electricidad', 'Zap', 40),
  ('plomeria', 'Plomería', 'Droplet', 50),
  ('iluminacion', 'Iluminación', 'Lightbulb', 60),
  ('jardin', 'Jardín y Exterior', 'Trees', 70),
  ('hogar', 'Hogar y Decoración', 'Sofa', 80),
  ('electrodomesticos', 'Electrodomésticos', 'Refrigerator', 90)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

INSERT INTO public.stores (code, name, city, address, phone, hours) VALUES
  ('Z10', 'RENOVA Zona 10', 'Guatemala', '12 Calle 4-50, Zona 10', '+502 2222 1010', 'L-D 8:00-20:00'),
  ('MIX', 'RENOVA Mixco', 'Mixco', 'Calzada Roosevelt km 13.5', '+502 2222 2020', 'L-D 8:00-20:00'),
  ('XEL', 'RENOVA Xela', 'Quetzaltenango', '4a Calle 12-15, Zona 3', '+502 7777 3030', 'L-S 8:00-19:00'),
  ('ANT', 'RENOVA Antigua', 'Antigua Guatemala', 'Calle Real 23', '+502 7888 4040', 'L-D 9:00-19:00')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city, address = EXCLUDED.address, phone = EXCLUDED.phone, hours = EXCLUDED.hours;

WITH product_seed(sku, slug, name, brand, category, price, original_price, rating, reviews, image, description, labels) AS (
  VALUES
  ('TLD-2001', 'taladro-dewalt-20v-max', 'Taladro Inalámbrico DeWalt 20V Max', 'DeWalt', 'herramientas', 1899, 2299, 4.8, 312, 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=900&q=80', 'Taladro percutor inalámbrico de 20V con batería de litio y maletín de transporte.', ARRAY['bestseller']),
  ('PNT-3210', 'pintura-latex-sherwin-galon', 'Pintura Látex Premium Blanco - Galón', 'Sherwin-Williams', 'pintura', 289, NULL, 4.7, 187, 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=900&q=80', 'Pintura látex lavable de alta cobertura, acabado mate, bajo olor y secado rápido.', ARRAY['bestseller']),
  ('SRR-1100', 'sierra-circular-bosch', 'Sierra Circular Bosch 7-1/4" 1400W', 'Bosch', 'herramientas', 1499, 1799, 4.6, 94, 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=900&q=80', 'Sierra circular profesional con motor de 1400W, hoja de 184mm y guía láser.', ARRAY['sale','low-stock']),
  ('LED-4400', 'foco-led-philips-9w', 'Foco LED Philips 9W Luz Cálida (pack 4)', 'Philips', 'iluminacion', 159, NULL, 4.9, 540, 'https://images.unsplash.com/photo-1565636192335-c44c1ca38a48?auto=format&fit=crop&w=900&q=80', 'Pack de 4 focos LED con luz cálida 3000K, equivalente a 60W incandescente.', ARRAY['bestseller']),
  ('CMT-8800', 'cemento-saco-42kg', 'Cemento Gris Saco 42.5 kg', 'Truper', 'construccion', 95, NULL, 4.5, 78, 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80', 'Cemento de uso general tipo Portland para concreto, repellos y mampostería.', ARRAY['bestseller']),
  ('REF-9900', 'refrigerador-bd-300l', 'Refrigeradora Black+Decker 300L Inverter', 'Black+Decker', 'electrodomesticos', 5499, 6299, 4.6, 132, 'https://images.unsplash.com/photo-1574269910231-bc508bcb40b4?auto=format&fit=crop&w=900&q=80', 'Refrigeradora de 2 puertas con tecnología inverter, no frost y eficiencia A+.', ARRAY['sale','new'])
)
INSERT INTO public.products (sku, slug, name, brand_id, category_id, price, original_price, rating, reviews, image, description, labels)
SELECT ps.sku, ps.slug, ps.name, b.id, c.id, ps.price, ps.original_price, ps.rating, ps.reviews, ps.image, ps.description, ps.labels
FROM product_seed ps
JOIN public.brands b ON b.name = ps.brand
JOIN public.categories c ON c.slug = ps.category
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  brand_id = EXCLUDED.brand_id,
  category_id = EXCLUDED.category_id,
  price = EXCLUDED.price,
  original_price = EXCLUDED.original_price,
  rating = EXCLUDED.rating,
  reviews = EXCLUDED.reviews,
  image = EXCLUDED.image,
  description = EXCLUDED.description,
  labels = EXCLUDED.labels,
  updated_at = now();

INSERT INTO public.inventory (product_id, store_id, qty)
SELECT p.id, s.id, CASE s.code WHEN 'Z10' THEN 18 WHEN 'MIX' THEN 12 WHEN 'XEL' THEN 8 ELSE 6 END
FROM public.products p
CROSS JOIN public.stores s
ON CONFLICT (product_id, store_id) DO NOTHING;
