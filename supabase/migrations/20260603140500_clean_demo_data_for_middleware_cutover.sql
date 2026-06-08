-- One-time cutover cleanup: remove demo/test ecommerce data before SAP B1 middleware becomes source of truth.
-- Preserves auth users, profiles, roles, payment gateways, shipping methods, system settings and admin config.
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'abandoned_carts',
    'addresses',
    'admin_price_list_items',
    'audit_logs',
    'brand_images',
    'carts',
    'category_images',
    'coupon_rules',
    'coupons',
    'crm_activity_timeline',
    'customer_accounts',
    'customer_store_preferences',
    'error_recovery_tasks',
    'idempotency_keys',
    'integration_event_queue',
    'inventory_reservations',
    'inventory',
    'invoice_items',
    'invoice_status_history',
    'invoices',
    'marketing_campaigns',
    'notifications',
    'payment_events',
    'payments',
    'order_status_history',
    'order_items',
    'orders',
    'product_images',
    'product_relations',
    'product_shipping_rules',
    'product_variants',
    'products',
    'promotional_banners',
    'promotions',
    'sap_business_partners',
    'sap_entity_mappings',
    'sap_events',
    'sap_sync_log',
    'sap_sync_logs',
    'shipment_events',
    'shipment_history',
    'shipments',
    'store_pickups',
    'support_tickets',
    'wishlist_items',
    'brands',
    'categories',
    'stores'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', v_table);
    END IF;
  END LOOP;
END $$;
