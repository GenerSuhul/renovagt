-- Compatibility fix for projects where shipping_methods was created before sort_order existed.
ALTER TABLE public.shipping_methods
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS shipping_methods_active_sort_idx
  ON public.shipping_methods (is_active, type, sort_order, base_price);
