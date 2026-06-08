-- RENOVA admin catalog visibility and product gallery sync.
-- Admin users must manage the full SAP catalog, while the storefront only reads
-- products intentionally published for ecommerce.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS alt_text TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.product_images
SET image_url = COALESCE(image_url, url)
WHERE image_url IS NULL;

UPDATE public.product_images
SET alt_text = COALESCE(alt_text, alt)
WHERE alt_text IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
GRANT SELECT ON public.product_images TO anon;

DROP POLICY IF EXISTS "Public read active products" ON public.products;
DROP POLICY IF EXISTS "products public read" ON public.products;
DROP POLICY IF EXISTS "Public read published products" ON public.products;
CREATE POLICY "Public read published products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND ecommerce_status = 'published');

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Admin manage catalog products" ON public.products;
CREATE POLICY "Admins manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage product media" ON public.product_images;
DROP POLICY IF EXISTS "Admin manage product media" ON public.product_images;
CREATE POLICY "Admin manage product media"
  ON public.product_images
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Public read product media" ON public.product_images;
DROP POLICY IF EXISTS "product_images public read" ON public.product_images;
CREATE POLICY "Public read product media"
  ON public.product_images
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON public.product_images(product_id, is_primary DESC, sort_order ASC, created_at ASC);

CREATE OR REPLACE FUNCTION public.sync_product_gallery(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_urls JSONB;
  v_primary TEXT;
BEGIN
  SELECT
    COALESCE(jsonb_agg(url_value ORDER BY is_primary DESC, sort_order ASC, created_at ASC), '[]'::jsonb),
    (array_agg(url_value ORDER BY is_primary DESC, sort_order ASC, created_at ASC))[1]
  INTO v_urls, v_primary
  FROM (
    SELECT
      COALESCE(NULLIF(image_url, ''), NULLIF(url, '')) AS url_value,
      is_primary,
      sort_order,
      created_at
    FROM public.product_images
    WHERE product_id = p_product_id
      AND COALESCE(NULLIF(image_url, ''), NULLIF(url, '')) IS NOT NULL
  ) media;

  UPDATE public.products
  SET image = COALESCE(v_primary, 'https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png'),
      images = COALESCE(v_urls, '[]'::jsonb),
      updated_at = now()
  WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_gallery_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product_id IS NOT NULL THEN
    PERFORM public.sync_product_gallery(v_product_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_gallery_after_change ON public.product_images;
CREATE TRIGGER trg_sync_product_gallery_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.product_images
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_gallery_trigger();

DO $$
DECLARE
  v_product_id UUID;
BEGIN
  FOR v_product_id IN SELECT DISTINCT product_id FROM public.product_images LOOP
    PERFORM public.sync_product_gallery(v_product_id);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.sync_product_gallery(UUID) TO authenticated, service_role;
