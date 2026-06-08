-- Final self-hosted cutover hardening.
-- Keeps the existing ecommerce/admin model, but removes permissive historical
-- policies before the schema is used as production source of truth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'logo',
    'logo',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  ),
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

DROP POLICY IF EXISTS "Public read renova public media" ON storage.objects;
CREATE POLICY "Public read renova public media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media'));

DROP POLICY IF EXISTS "Admins read renova private imports" ON storage.objects;
CREATE POLICY "Admins read renova private imports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bulk-imports' AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins upload renova media" ON storage.objects;
CREATE POLICY "Admins upload renova media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins update renova media" ON storage.objects;
CREATE POLICY "Admins update renova media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins delete renova media" ON storage.objects;
CREATE POLICY "Admins delete renova media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('logo', 'product-media', 'category-media', 'banner-media', 'brand-media', 'bulk-imports')
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Public read brands" ON public.brands;
DROP POLICY IF EXISTS "brands public read" ON public.brands;
DROP POLICY IF EXISTS "Public read active brands" ON public.brands;
CREATE POLICY "Public read active brands"
  ON public.brands FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public read inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory public read" ON public.inventory;
DROP POLICY IF EXISTS "Public read published inventory" ON public.inventory;
CREATE POLICY "Public read published inventory"
  ON public.inventory FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = inventory.product_id
        AND p.is_active = true
        AND p.ecommerce_status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins manage inventory" ON public.inventory;
CREATE POLICY "Admins manage inventory"
  ON public.inventory FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Public read product media" ON public.product_images;
DROP POLICY IF EXISTS "product_images public read" ON public.product_images;
DROP POLICY IF EXISTS "Public read published product media" ON public.product_images;
CREATE POLICY "Public read published product media"
  ON public.product_images FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.is_active = true
        AND p.ecommerce_status = 'published'
    )
  );

DROP POLICY IF EXISTS "Public read category media" ON public.category_images;
DROP POLICY IF EXISTS "Public read active category media" ON public.category_images;
CREATE POLICY "Public read active category media"
  ON public.category_images FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.categories c
      WHERE c.id = category_images.category_id
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS "Public read brand media" ON public.brand_images;
DROP POLICY IF EXISTS "Public read active brand media" ON public.brand_images;
CREATE POLICY "Public read active brand media"
  ON public.brand_images FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.brands b
      WHERE b.id = brand_images.brand_id
        AND b.is_active = true
    )
  );

DROP POLICY IF EXISTS "Authenticated shipping methods CRUD" ON public.shipping_methods;
DROP POLICY IF EXISTS "Admins manage shipping methods" ON public.shipping_methods;
CREATE POLICY "Admins manage shipping methods"
  ON public.shipping_methods FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated product shipping rules CRUD" ON public.product_shipping_rules;
DROP POLICY IF EXISTS "Public read product shipping rules" ON public.product_shipping_rules;
DROP POLICY IF EXISTS "Public read enabled product shipping rules" ON public.product_shipping_rules;
CREATE POLICY "Public read enabled product shipping rules"
  ON public.product_shipping_rules FOR SELECT TO anon, authenticated
  USING (
    is_enabled = true
    AND EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_shipping_rules.product_id
        AND p.is_active = true
        AND p.ecommerce_status = 'published'
    )
  );

DROP POLICY IF EXISTS "Admins manage product shipping rules" ON public.product_shipping_rules;
CREATE POLICY "Admins manage product shipping rules"
  ON public.product_shipping_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage enterprise tables" ON public.product_variants;
DROP POLICY IF EXISTS "Admins manage product variants" ON public.product_variants;
CREATE POLICY "Admins manage product variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage product relations" ON public.product_relations;
DROP POLICY IF EXISTS "Admins manage product relations" ON public.product_relations;
CREATE POLICY "Admins manage product relations"
  ON public.product_relations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage shipments" ON public.shipments;
DROP POLICY IF EXISTS "Admins manage shipments" ON public.shipments;
CREATE POLICY "Admins manage shipments"
  ON public.shipments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage shipment history" ON public.shipment_history;
DROP POLICY IF EXISTS "Admins manage shipment history" ON public.shipment_history;
CREATE POLICY "Admins manage shipment history"
  ON public.shipment_history FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own shipment history" ON public.shipment_history;
CREATE POLICY "Users read own shipment history"
  ON public.shipment_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.shipments s
      JOIN public.orders o ON o.id = s.order_id
      WHERE s.id = shipment_history.shipment_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated manage invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Admins manage invoice items" ON public.invoice_items;
CREATE POLICY "Admins manage invoice items"
  ON public.invoice_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own invoice items" ON public.invoice_items;
CREATE POLICY "Users read own invoice items"
  ON public.invoice_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND i.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated manage invoice status" ON public.invoice_status_history;
DROP POLICY IF EXISTS "Admins manage invoice status history" ON public.invoice_status_history;
CREATE POLICY "Admins manage invoice status history"
  ON public.invoice_status_history FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own invoice status history" ON public.invoice_status_history;
CREATE POLICY "Users read own invoice status history"
  ON public.invoice_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_status_history.invoice_id
        AND i.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated manage crm timeline" ON public.crm_activity_timeline;
DROP POLICY IF EXISTS "Admins manage crm timeline" ON public.crm_activity_timeline;
CREATE POLICY "Admins manage crm timeline"
  ON public.crm_activity_timeline FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Admins manage support tickets" ON public.support_tickets;
CREATE POLICY "Admins manage support tickets"
  ON public.support_tickets FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Admins manage marketing campaigns" ON public.marketing_campaigns;
CREATE POLICY "Admins manage marketing campaigns"
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage coupons" ON public.coupon_rules;
DROP POLICY IF EXISTS "Admins manage coupon rules" ON public.coupon_rules;
CREATE POLICY "Admins manage coupon rules"
  ON public.coupon_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage abandoned carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Admins manage abandoned carts" ON public.abandoned_carts;
CREATE POLICY "Admins manage abandoned carts"
  ON public.abandoned_carts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;
CREATE POLICY "Admins manage notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "sap bp read auth" ON public.sap_business_partners;
DROP POLICY IF EXISTS "Admins manage sap business partners" ON public.sap_business_partners;
CREATE POLICY "Admins manage sap business partners"
  ON public.sap_business_partners FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
