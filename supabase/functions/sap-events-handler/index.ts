// Supabase Edge Function: sap-events-handler
// Receives normalized events from the SAP B1 on-premise middleware,
// persists the raw event in `sap_events`, and projects the payload into
// the corresponding domain tables (products, prices, inventory, customers,
// invoices). All processing is idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-webhook-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCEPTED_EVENTS = new Set([
  "bridge.heartbeat",
  "catalog.categories.upsert",
  "catalog.brands.upsert",
  "catalog.products.upsert",
  "catalog.product_images.upsert",
  "catalog.product_variants.upsert",
  "catalog.prices.upsert",
  "stores.upsert",
  "inventory.upsert",
  "inventory.reserve_requested",
  "inventory.release_requested",
  "customers.upsert",
  "customers.credit_status.upsert",
  "customers.price_list.assign",
  "order.created",
  "order.paid",
  "order.cancelled",
  "payment.approved",
  "payment.rejected",
  "payment.refunded",
  "invoice.create_requested",
  "sap.invoice.upsert",
  "sap.invoice.cancelled",
  "sap.credit_note.upsert",
  "orders.sap_ack",
  "orders.sap_rejected",
  "shipments.tracking.upsert",
]);

type JsonRecord = Record<string, unknown>;

interface SapEvent {
  event: string;
  timestamp?: string;
  correlation_id?: string;
  idempotency_key?: string;
  source?: string;
  payload?: unknown;
  events?: SapEvent[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getPayloadData(p: unknown) {
  if (isRecord(p) && "data" in p) return (p as JsonRecord).data;
  return p ?? null;
}

function toArray(d: unknown): JsonRecord[] {
  if (Array.isArray(d)) return d.filter(isRecord) as JsonRecord[];
  if (isRecord(d)) return [d];
  return [];
}

function slugify(s: string) {
  return s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalize(evt: SapEvent) {
  const timestamp = evt.timestamp ?? new Date().toISOString();
  const payload = isRecord(evt.payload) ? evt.payload : {};
  return {
    event: evt.event,
    timestamp,
    correlationId:
      evt.correlation_id ??
      (typeof payload.correlation_id === "string" ? payload.correlation_id : undefined),
    idempotencyKey:
      evt.idempotency_key ??
      (typeof payload.idempotency_key === "string" ? payload.idempotency_key : undefined),
    source:
      evt.source ?? (typeof payload.source === "string" ? payload.source : "SAP_B1"),
    data: getPayloadData(evt.payload),
    raw: evt,
  };
}

// --- Domain projectors -----------------------------------------------------

async function ensureBrand(sb: any, code: string): Promise<string | null> {
  if (!code) return null;
  const slug = `sap-${slugify(code)}`;
  const { data } = await sb
    .from("brands")
    .upsert({ slug, name: code }, { onConflict: "slug" })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function ensureCategory(sb: any, code: string): Promise<string | null> {
  if (!code) return null;
  const slug = `sap-${slugify(code)}`;
  const { data } = await sb
    .from("categories")
    .upsert(
      {
        slug,
        name: `Categoría ${code}`,
        sap_group_code: Number.isFinite(Number(code)) ? Number(code) : null,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  return data?.id ?? null;
}

async function ensureStore(sb: any, code: string): Promise<string | null> {
  if (!code) return null;
  const { data } = await sb
    .from("stores")
    .upsert({ code, name: code }, { onConflict: "code" })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function projectProducts(sb: any, rows: JsonRecord[]) {
  for (const r of rows) {
    const itemCode = String(r.item_code ?? "");
    if (!itemCode) continue;
    const name = String(r.item_name ?? itemCode);
    const brandId = r.brand ? await ensureBrand(sb, String(r.brand)) : null;
    const categoryId = r.category_code
      ? await ensureCategory(sb, String(r.category_code))
      : null;
    const slug = `${slugify(name)}-${slugify(itemCode)}`;

    await sb
      .from("products")
      .upsert(
        {
          sap_item_code: itemCode,
          sku: itemCode,
          name,
          slug,
          brand_id: brandId,
          category_id: categoryId,
          is_active: r.is_active !== false,
          sap_sync_status: "synced",
          sap_last_sync_at: new Date().toISOString(),
        },
        { onConflict: "sap_item_code" },
      );
  }
}

async function projectPrices(sb: any, rows: JsonRecord[]) {
  // Use price_list "1" as the storefront price by default.
  for (const r of rows) {
    const itemCode = String(r.item_code ?? "");
    const price = Number(r.price ?? 0);
    const list = String(r.price_list ?? "1");
    if (!itemCode || list !== "1") continue;
    await sb
      .from("products")
      .update({
        price,
        currency: String(r.currency ?? "GTQ").replace("QTZ", "GTQ"),
      })
      .eq("sap_item_code", itemCode);
  }
}

async function projectInventory(sb: any, rows: JsonRecord[]) {
  // Pre-resolve store + product ids in batch
  const storeCache = new Map<string, string | null>();
  const productCache = new Map<string, string | null>();

  for (const r of rows) {
    const itemCode = String(r.item_code ?? "");
    const wh = String(r.warehouse_code ?? "");
    if (!itemCode || !wh) continue;

    if (!storeCache.has(wh)) storeCache.set(wh, await ensureStore(sb, wh));
    const storeId = storeCache.get(wh)!;

    if (!productCache.has(itemCode)) {
      const { data } = await sb
        .from("products")
        .select("id")
        .eq("sap_item_code", itemCode)
        .maybeSingle();
      productCache.set(itemCode, data?.id ?? null);
    }
    const productId = productCache.get(itemCode);
    if (!productId || !storeId) continue;

    const qty = Number(r.on_hand ?? 0);
    const committed = Number(r.committed ?? 0);
    const available = Number(r.available ?? Math.max(qty - committed, 0));

    await sb
      .from("inventory")
      .upsert(
        {
          product_id: productId,
          store_id: storeId,
          qty,
          committed,
          available,
          last_sap_sync_at: new Date().toISOString(),
        },
        { onConflict: "product_id,store_id" },
      );
  }
}

async function projectCustomers(sb: any, rows: JsonRecord[]) {
  for (const r of rows) {
    const cardCode = String(r.card_code ?? "").trim();
    if (!cardCode || cardCode === ",") continue;
    await sb
      .from("sap_business_partners")
      .upsert(
        {
          sap_card_code: cardCode,
          card_name: r.card_name ? String(r.card_name) : null,
          customer_type: r.customer_type ? String(r.customer_type) : null,
          nit: r.nit ? String(r.nit) : null,
          email: r.email ? String(r.email) : null,
          phone: r.phone ? String(r.phone) : null,
          credit_limit: r.credit_limit != null ? Number(r.credit_limit) : null,
          price_list: r.price_list ? String(r.price_list) : null,
          is_active: r.is_active !== false,
          raw: r,
          last_sap_sync_at: new Date().toISOString(),
        },
        { onConflict: "sap_card_code" },
      );
  }
}

async function projectInvoiceUpsert(sb: any, rows: JsonRecord[]) {
  for (const r of rows) {
    const docEntry = Number(r.doc_entry);
    if (!Number.isFinite(docEntry)) continue;
    await sb
      .from("invoices")
      .upsert(
        {
          sap_doc_entry: docEntry,
          sap_doc_num: r.doc_num != null ? String(r.doc_num) : null,
          invoice_number: r.fel_uuid ? String(r.fel_uuid) : null,
          total: Number(r.doc_total ?? 0),
          subtotal: Number(r.doc_total ?? 0),
          tax: 0,
          currency: String(r.currency ?? "GTQ").replace("QTZ", "GTQ"),
          status: String(r.status ?? "issued"),
          raw_payload: r,
          issued_at: new Date().toISOString(),
        },
        { onConflict: "sap_doc_entry" },
      );
  }
}

async function projectInvoiceCancelled(sb: any, rows: JsonRecord[]) {
  for (const r of rows) {
    const docEntry = Number(r.doc_entry);
    if (!Number.isFinite(docEntry)) continue;
    await sb
      .from("invoices")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("sap_doc_entry", docEntry);
  }
}

async function processEvent(sb: any, eventType: string, data: unknown) {
  const rows = toArray(data);
  switch (eventType) {
    case "catalog.products.upsert":
      await projectProducts(sb, rows);
      break;
    case "catalog.prices.upsert":
      await projectPrices(sb, rows);
      break;
    case "inventory.upsert":
      await projectInventory(sb, rows);
      break;
    case "customers.upsert":
      await projectCustomers(sb, rows);
      break;
    case "sap.invoice.upsert":
      await projectInvoiceUpsert(sb, rows);
      break;
    case "sap.invoice.cancelled":
      await projectInvoiceCancelled(sb, rows);
      break;
    // Other event types are recorded in sap_events for later processing.
    default:
      break;
  }
}

// --- HTTP entrypoint -------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WebhookSecret");
  if (!expectedSecret) return json({ ok: false, error: "Server misconfiguration" }, 500);
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json({ ok: false, error: "Invalid webhook secret" }, 401);
  }

  let body: SapEvent;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const incoming: SapEvent[] = Array.isArray(body.events) ? body.events : [body];
  const results: Array<Record<string, unknown>> = [];

  for (const raw of incoming) {
    const evt = normalize(raw);
    if (!evt.event || !ACCEPTED_EVENTS.has(evt.event)) {
      results.push({ event: evt.event, ok: false, error: "Unknown event type" });
      continue;
    }

    if (evt.event === "bridge.heartbeat") {
      console.log(`[sap-events-handler] heartbeat ${evt.timestamp}`);
      results.push({ event: evt.event, ok: true });
      continue;
    }

    if (!evt.correlationId || !evt.idempotencyKey) {
      results.push({
        event: evt.event,
        ok: false,
        error: "Missing correlation_id or idempotency_key",
      });
      continue;
    }

    const record = {
      event_type: evt.event,
      payload: {
        event: evt.event,
        timestamp: evt.timestamp,
        correlation_id: evt.correlationId,
        idempotency_key: evt.idempotencyKey,
        source: evt.source,
        data: evt.data,
      },
      received_at: new Date().toISOString(),
    };

    let sapEventId: string | undefined;
    let duplicate = false;
    try {
      const { data, error } = await sb
        .from("sap_events")
        .insert(record)
        .select("id")
        .single();
      if (error) throw error;
      sapEventId = data?.id;
    } catch (err) {
      results.push({
        event: evt.event,
        ok: false,
        idempotency_key: evt.idempotencyKey,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Project into domain tables.
    try {
      await processEvent(sb, evt.event, evt.data);
      if (sapEventId) {
        await sb
          .from("sap_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("id", sapEventId);
      }
      results.push({
        event: evt.event,
        ok: true,
        idempotency_key: evt.idempotencyKey,
        correlation_id: evt.correlationId,
        sap_event_id: sapEventId,
        duplicate,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sap-events-handler] ${evt.event} project error:`, message);
      if (sapEventId) {
        await sb
          .from("sap_events")
          .update({ processing_error: message })
          .eq("id", sapEventId);
      }
      results.push({
        event: evt.event,
        ok: false,
        idempotency_key: evt.idempotencyKey,
        correlation_id: evt.correlationId,
        sap_event_id: sapEventId,
        error: message,
      });
    }
  }

  const ok = results.every((r) => r.ok);
  return json({
    ok,
    received: incoming.length,
    processed: results.filter((r) => r.ok).length,
    results,
  });
});
