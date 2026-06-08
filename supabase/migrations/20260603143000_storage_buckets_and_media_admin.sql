-- RENOVA media storage for ecommerce assets.
-- Public buckets serve storefront images. The bulk ZIP bucket keeps original
-- admin uploads private for audit/reprocessing.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'product-media',
    'product-media',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'category-media',
    'category-media',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'banner-media',
    'banner-media',
    true,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'brand-media',
    'brand-media',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
  (
    'bulk-imports',
    'bulk-imports',
    false,
    104857600,
    ARRAY[
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip',
      'application/octet-stream'
    ]
  )
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS alt_text TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_images'
      AND column_name = 'url'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET image_url = COALESCE(image_url, url) WHERE image_url IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_images'
      AND column_name = 'alt'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET alt_text = COALESCE(alt_text, alt) WHERE alt_text IS NULL';
  END IF;
END $$;

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

ALTER TABLE public.promotional_banners
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.brands,
  public.categories,
  public.products,
  public.product_images,
  public.category_images,
  public.brand_images,
  public.promotional_banners
TO authenticated;

ALTER TABLE public.category_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage product media" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated manage category media" ON public.category_images;
DROP POLICY IF EXISTS "Authenticated manage brand media" ON public.brand_images;
DROP POLICY IF EXISTS "Authenticated manage banners" ON public.promotional_banners;

DROP POLICY IF EXISTS "Admin manage catalog brands" ON public.brands;
CREATE POLICY "Admin manage catalog brands"
  ON public.brands FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage catalog categories" ON public.categories;
CREATE POLICY "Admin manage catalog categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage catalog products" ON public.products;
CREATE POLICY "Admin manage catalog products"
  ON public.products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage product media" ON public.product_images;
CREATE POLICY "Admin manage product media"
  ON public.product_images FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage category media" ON public.category_images;
CREATE POLICY "Admin manage category media"
  ON public.category_images FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage brand media" ON public.brand_images;
CREATE POLICY "Admin manage brand media"
  ON public.brand_images FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admin manage promotional banners" ON public.promotional_banners;
CREATE POLICY "Admin manage promotional banners"
  ON public.promotional_banners FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Public read renova public media" ON storage.objects;
CREATE POLICY "Public read renova public media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('product-media', 'category-media', 'banner-media', 'brand-media'));

DROP POLICY IF EXISTS "Admins read renova private imports" ON storage.objects;
CREATE POLICY "Admins read renova private imports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bulk-imports' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins upload renova media" ON storage.objects;
CREATE POLICY "Admins upload renova media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins update renova media" ON storage.objects;
CREATE POLICY "Admins update renova media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id IN ('product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins delete renova media" ON storage.objects;
CREATE POLICY "Admins delete renova media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );
