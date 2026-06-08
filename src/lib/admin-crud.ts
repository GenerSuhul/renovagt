import { supabase } from "@/integrations/supabase/client";

export type AdminTable =
  | "admin_price_lists"
  | "admin_price_list_items"
  | "customer_accounts"
  | "sap_business_partners"
  | "shipping_methods"
  | "product_shipping_rules"
  | "payment_gateways"
  | "profiles"
  | "categories"
  | "products"
  | "inventory"
  | "orders"
  | "order_items"
  | "order_status_history"
  | "carts"
  | "payments"
  | "payment_events"
  | "product_images"
  | "category_images"
  | "brand_images"
  | "product_variants"
  | "inventory_reservations"
  | "shipments"
  | "integration_event_queue"
  | "sap_events"
  | "sap_entity_mappings"
  | "sap_sync_logs"
  | "sap_sync_log"
  | "idempotency_keys"
  | "invoices"
  | "crm_activity_timeline"
  | "support_tickets"
  | "marketing_campaigns"
  | "coupon_rules"
  | "notifications"
  | "audit_logs"
  | "system_settings"
  | "user_roles"
  | "error_recovery_tasks"
  | "promotional_banners";

type DbRecord = Record<string, unknown>;

type Query = {
  select: (columns?: string) => Query;
  insert: (payload: DbRecord) => Query;
  update: (payload: DbRecord) => Query;
  delete: () => Query;
  eq: (column: string, value: unknown) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
  range: (from: number, to: number) => Query;
  single: () => Promise<{ data: DbRecord | null; error: Error | null }>;
  then: Promise<{ data: DbRecord[] | null; error: Error | null }>["then"];
};

const from = (table: AdminTable) =>
  (supabase as unknown as { from: (table: string) => Query }).from(table);

const parseJson = (value: string | undefined, fallback: unknown) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const nullableNumber = (value: string | undefined) => (value ? Number(value) : null);

export async function listAdminRecords(table: AdminTable, columns = "*", limit = 1000) {
  const pageSize = 1000;
  const rows: DbRecord[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await from(table).select(columns).range(offset, to);
    if (error) {
      if (!error.message.includes("Could not find the table")) {
        console.warn(`[Admin CRUD] list ${table} failed`, error.message);
      }
      return rows;
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

export async function createAdminRecord(table: AdminTable, payload: DbRecord) {
  const { data, error } = await from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAdminRecord(table: AdminTable, id: string, payload: DbRecord) {
  const { data, error } = await from(table).update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteAdminRecord(table: AdminTable, id: string) {
  const { error } = await from(table).delete().eq("id", id);
  if (error) throw error;
}

export function buildPayload(module: string, values: Record<string, string>): { table: AdminTable; payload: DbRecord } {
  switch (module) {
    case "price-lists":
      return {
        table: "admin_price_lists",
        payload: {
          code: values.code,
          name: values.name,
          customer_type: values.customer_type || "b2c",
          currency: values.currency || "GTQ",
          priority: Number(values.priority || 0),
          is_active: values.status !== "inactive",
        },
      };
    case "b2c-users":
      return {
        table: "sap_business_partners",
        payload: {
          sap_card_code: values.sap_card_code || `WEB-${Date.now()}`,
          customer_type: "B2C",
          email: values.email,
          card_name: values.full_name,
          phone: values.phone || null,
          is_active: values.status !== "blocked",
          price_list: values.price_list || null,
        },
      };
    case "b2b-users":
      return {
        table: "sap_business_partners",
        payload: {
          sap_card_code: values.sap_card_code || `B2B-${Date.now()}`,
          customer_type: "B2B",
          email: values.email,
          card_name: values.company_name || values.full_name,
          phone: values.phone || null,
          nit: values.tax_id || null,
          credit_limit: Number(values.credit_limit || 0),
          is_active: values.status !== "blocked",
          price_list: values.price_list || null,
        },
      };
    case "shipping":
      return {
        table: "shipping_methods",
        payload: {
          code: values.code,
          name: values.name,
          type: values.type || "delivery",
          base_price: Number(values.base_price || 0),
          free_from: values.free_from ? Number(values.free_from) : null,
          estimated_days: values.estimated_days || "Por definir",
          is_active: values.status !== "inactive",
        },
      };
    case "payments":
      return {
        table: "payment_gateways",
        payload: {
          code: values.code,
          name: values.name,
          provider: values.provider,
          environment: values.environment || "sandbox",
          status: values.status || "testing",
          currency: values.currency || "GTQ",
          supports_installments: values.supports_installments === "true",
          public_key: values.public_key || null,
          webhook_url: values.webhook_url || null,
        },
      };
    case "products":
      {
        const image = values.image || "https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png";
        const ecommerceStatus = values.ecommerce_status || (values.status === "inactive" ? "draft" : "published");
        const needsEnrichment = ecommerceStatus === "needs_enrichment";
        return {
          table: "products",
          payload: {
            sku: values.sku,
            slug: values.slug,
            name: values.name,
            price: Number(values.price || 0),
            original_price: values.original_price ? Number(values.original_price) : null,
            currency: values.currency || "GTQ",
            image,
            images: image ? [image] : [],
            description: values.description,
            short_description: values.short_description || values.description,
            weight_kg: nullableNumber(values.weight_kg),
            dimensions: {
              width_cm: Number(values.width_cm || 0),
              height_cm: Number(values.height_cm || 0),
              depth_cm: Number(values.depth_cm || 0),
            },
            sap_item_code: values.sap_item_code || values.sku,
            sap_sync_status: "manual",
            ecommerce_status: ecommerceStatus,
            enrichment_status: needsEnrichment ? "needs_enrichment" : "complete",
            enrichment_required: needsEnrichment,
            shipping_class: values.shipping_class || "standard",
            safety_stock_default: Number(values.safety_stock_default || 0),
            is_active: values.status !== "inactive",
          },
        };
      }
    case "shipping-products":
      return {
        table: "product_shipping_rules",
        payload: {
          product_id: values.product_id,
          shipping_method_id: values.shipping_method_id,
          requires_quote: values.requires_quote === "true",
          max_qty_per_order: values.max_qty_per_order ? Number(values.max_qty_per_order) : null,
          notes: values.notes || null,
          is_enabled: true,
        },
      };
    case "categories":
      return {
        table: "categories",
        payload: {
          slug: values.slug,
          name: values.name,
          icon: values.icon || "Wrench",
          sort_order: Number(values.sort_order || 0),
          is_active: values.status !== "inactive",
        },
      };
    case "media":
      return {
        table: "product_images",
        payload: {
          product_id: values.product_id,
          url: values.image_url,
          alt: values.alt_text || null,
          sort_order: Number(values.sort_order || 0),
          is_primary: values.is_primary === "true",
        },
      };
    case "content":
      return {
        table: "promotional_banners",
        payload: {
          title: values.title,
          subtitle: values.subtitle || null,
          image_url: values.image_url,
          target_url: values.target_url || null,
          placement: values.placement || "home_slider",
          sort_order: Number(values.sort_order || 0),
          is_active: values.status !== "inactive",
        },
      };
    case "variants":
      return {
        table: "product_variants",
        payload: {
          product_id: values.product_id,
          sku: values.sku,
          name: values.name,
          attributes: parseJson(values.attributes, {}),
          price_delta: Number(values.price_delta || values.price || 0),
          is_active: values.status !== "inactive",
        },
      };
    case "stock-realtime":
      return {
        table: "inventory_reservations",
        payload: {
          product_id: values.product_id,
          store_id: values.store_id,
          qty: Number(values.qty || 1),
          status: values.status || "reserved",
          expires_at: values.expires_at || null,
        },
      };
    case "forza":
      return {
        table: "shipments",
        payload: {
          order_id: values.order_id,
          origin_store_id: values.origin_store_id || null,
          carrier: "FORZA",
          status: values.status || "pending",
          cost: nullableNumber(values.quote_amount),
          weight_kg: nullableNumber(values.weight_kg),
          volumetric_weight: nullableNumber(values.volumetric_weight),
          package_count: Number(values.package_count || 1),
          destination: parseJson(values.destination, {}),
        },
      };
    case "sap-queue":
      return {
        table: "integration_event_queue",
        payload: {
          event_type: values.event_type,
          aggregate_type: values.aggregate_type,
          aggregate_id: values.aggregate_id || null,
          payload: parseJson(values.payload, {}),
          status: values.status || "pending",
        },
      };
    case "invoices":
      return {
        table: "invoices",
        payload: {
          order_id: values.order_id || null,
          invoice_number: values.invoice_number,
          status: values.invoice_status || "pending",
          subtotal: Number(values.subtotal || 0),
          tax: Number(values.tax || 0),
          total: Number(values.total || 0),
        },
      };
    case "crm":
      return {
        table: "crm_activity_timeline",
        payload: {
          customer_account_id: values.customer_account_id || null,
          activity_type: values.activity_type || "note",
          title: values.title,
          description: values.description || null,
          metadata: parseJson(values.metadata, {}),
        },
      };
    case "support":
      return {
        table: "support_tickets",
        payload: {
          customer_account_id: values.customer_account_id || null,
          order_id: values.order_id || null,
          subject: values.subject,
          status: values.status || "open",
          priority: values.priority || "normal",
          channel: values.channel || "web",
        },
      };
    case "campaigns":
      return {
        table: "marketing_campaigns",
        payload: {
          name: values.name,
          campaign_type: values.campaign_type || "homepage_banner",
          status: values.status || "draft",
          target_rules: parseJson(values.target_rules, {}),
          budget: nullableNumber(values.budget),
          starts_at: values.starts_at || null,
          ends_at: values.ends_at || null,
        },
      };
    case "coupons":
      return {
        table: "coupon_rules",
        payload: {
          code: values.code,
          description: values.description || null,
          discount_type: values.discount_type || "percent",
          discount_value: Number(values.discount_value || 0),
          min_order_total: nullableNumber(values.min_order_total),
          usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
          target_rules: parseJson(values.target_rules, {}),
          is_active: values.status !== "inactive",
        },
      };
    case "notifications":
      return {
        table: "notifications",
        payload: {
          customer_account_id: values.customer_account_id || null,
          channel: values.channel || "email",
          event_type: values.event_type,
          subject: values.subject || null,
          body: values.body || null,
          payload: parseJson(values.payload, {}),
          status: values.status || "pending",
        },
      };
    case "audit":
      return {
        table: "audit_logs",
        payload: {
          action: values.action,
          entity_type: values.entity_type,
          entity_id: values.entity_id || null,
          after_data: parseJson(values.after_data, {}),
        },
      };
    default:
      throw new Error(`El módulo ${module} todavía no tiene CRUD configurado.`);
  }
}
