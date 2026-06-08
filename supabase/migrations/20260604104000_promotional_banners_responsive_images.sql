-- Responsive banner media for ecommerce sliders and marketing placements.
ALTER TABLE public.promotional_banners
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS desktop_image_url text,
  ADD COLUMN IF NOT EXISTS mobile_image_url text,
  ADD COLUMN IF NOT EXISTS desktop_storage_path text,
  ADD COLUMN IF NOT EXISTS mobile_storage_path text,
  ADD COLUMN IF NOT EXISTS text_align text NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS text_theme text NOT NULL DEFAULT 'light';

UPDATE public.promotional_banners
SET desktop_image_url = COALESCE(desktop_image_url, image_url)
WHERE desktop_image_url IS NULL
  AND image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotional_banners_placement_active_sort
  ON public.promotional_banners (placement, is_active, sort_order);
