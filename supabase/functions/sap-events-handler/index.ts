// Supabase Edge Function: sap-events-handler
// Contract for the SAP B1 on-premise middleware:
// {
//   event_type, correlation_id, idempotency_key, payload_count,
//   payload: { row_count, data: [...] }
// }
// The handler always processes payload.data and returns row counts so the
// middleware can retry only when processing truly failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-webhook-secret, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCEPTED_EVENTS = new Set([
  "bridge.heartbeat",
  "price_lists.sync.batch",
  "catalog.products.upsert",
  "catalog.prices.upsert",
  "customers.upsert",
  "inventory.upsert",
  "sap.invoice.upsert",
  "sap.invoice.cancelled",
  "orders.sap_ack",
]);

const FALLBACK_IMAGE = "https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png";

type JsonRecord = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;

interface MiddlewareEvent {
  event_type?: string;
  event?: string;
  timestamp?: string;
  correlation_id?: string;
  idempotency_key?: string;
  source?: string;
  payload_count?: number;
  payload?: unknown;
  events?: MiddlewareEvent[];
}

type NormalizedEvent = {
  event: string;
  timestamp: string;
  correlationId?: string;
  idempotencyKey?: string;
  source: string;
  payloadCount?: number;
  expectedRows: number;
  data: unknown;
  rows: unknown[];
  raw: MiddlewareEvent;
};

class SkippedRowError extends Error {
  reason: string;

  constructor(message: string, reason = "invalid_row") {
    super(message);
    this.name = "SkippedRowError";
    this.reason = reason;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isRecord(error)) {
    const message = [
      typeof error.message === "string" ? error.message : "",
      typeof error.details === "string" ? error.details : "",
      typeof error.hint === "string" ? error.hint : "",
      typeof error.code === "string" ? `code=${error.code}` : "",
    ]
      .filter(Boolean)
      .join(" | ");
    return message || JSON.stringify(error);
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) return [data];
  return [];
}

function text(row: JsonRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function number(row: JsonRecord, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  }
  return fallback;
}

function bool(row: JsonRecord, keys: string[], fallback = true) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "y", "yes", "1", "active", "activo"].includes(normalized)) return true;
      if (["false", "n", "no", "0", "inactive", "inactivo"].includes(normalized)) return false;
    }
  }
  return fallback;
}

function slugify(value: string) {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function normalizeSource(rawSource: unknown) {
  const source = typeof rawSource === "string" && rawSource.trim() ? rawSource.trim() : "sap_b1_middleware";
  return source === "sap_b1" ? "sap_b1_middleware" : source;
}

function normalizeNit(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized || normalized === "CF" || /^0+$/.test(normalized)) return null;
  return normalized;
}

function isInvalidSapCode(value: string) {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "," || normalized === "null" || normalized === "undefined";
}

function normalize(raw: MiddlewareEvent): NormalizedEvent {
  const payload = isRecord(raw.payload) ? raw.payload : {};
  const data = "data" in payload ? payload.data : raw.payload;
  const rows = toRows(data);
  const rowCount = typeof payload.row_count === "number" ? payload.row_count : undefined;
  const payloadCount = typeof raw.payload_count === "number" ? raw.payload_count : rowCount;
  const event = raw.event_type ?? raw.event ?? "";
  const source = normalizeSource(raw.source ?? payload.source);
  const expectedRows =
    event === "bridge.heartbeat"
      ? Math.max(payloadCount ?? rows.length, 1)
      : payloadCount ?? rows.length;

  return {
    event,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    correlationId: raw.correlation_id,
    idempotencyKey: raw.idempotency_key,
    source,
    payloadCount: event === "bridge.heartbeat" ? expectedRows : payloadCount,
    expectedRows,
    data,
    rows,
    raw,
  };
}

async function ensureBrand(sb: SupabaseClient, code: string) {
  if (!code) return null;
  const slug = `sap-${slugify(code) || "brand"}`;
  const { data, error } = await sb
    .from("brands")
    .upsert({ slug, name: code, is_active: true }, { onConflict: "slug" })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureCategory(sb: SupabaseClient, code: string, name?: string) {
  if (!code) return null;
  const slug = `sap-${slugify(code) || "category"}`;
  const { data, error } = await sb
    .from("categories")
    .upsert(
      {
        slug,
        name: name || `Categoria ${code}`,
        sap_group_code: Number.isFinite(Number(code)) ? Number(code) : null,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

async function ensureStore(sb: SupabaseClient, code: string, row?: JsonRecord) {
  if (!code) return null;
  const { data, error } = await sb
    .from("stores")
    .upsert(
      {
        code,
        name: text(row ?? {}, ["warehouse_name", "WarehouseName", "store_name", "StoreName"], code),
        city: text(row ?? {}, ["city", "City"], ""),
        address: text(row ?? {}, ["address", "Address", "street", "Street"], ""),
        phone: text(row ?? {}, ["phone", "Phone"], ""),
        hours: text(row ?? {}, ["hours", "Hours"], ""),
        is_active: true,
      },
      { onConflict: "code" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

async function projectProduct(sb: SupabaseClient, row: JsonRecord) {
  const itemCode = text(row, ["item_code", "ItemCode", "sku", "SKU"]);
  if (isInvalidSapCode(itemCode)) throw new SkippedRowError("Missing or invalid item_code", "invalid_item_code");

  const itemName = text(row, ["item_name", "ItemName", "name", "Name"], itemCode);
  const brandCode = text(row, ["brand", "Brand", "brand_code", "BrandCode"]);
  const categoryCode = text(row, ["category_code", "ItemsGroupCode", "items_group_code", "category"]);
  const categoryName = text(row, ["category_name", "ItemsGroupName", "items_group_name"]);
  const externalId = text(row, ["external_id", "ExternalId"], `SAP-ITEM:${itemCode}`);
  const barcode = text(row, ["barcode", "BarCode", "CodeBars"]) || null;
  const brandId = brandCode ? await ensureBrand(sb, brandCode) : null;
  const categoryId = categoryCode ? await ensureCategory(sb, categoryCode, categoryName) : null;

  const { data: existing, error: existingError } = await sb
    .from("products")
    .select("id, slug, ecommerce_status, enrichment_status, enrichment_required, is_active")
    .eq("sap_item_code", itemCode)
    .maybeSingle();
  if (existingError) throw existingError;

  const isNew = !existing;
  const base = {
    external_id: externalId,
    item_code: itemCode,
    sap_item_code: itemCode,
    sku: itemCode,
    name: itemName,
    brand_id: brandId,
    category_id: categoryId,
    barcode,
    price: number(row, ["price", "Price"], 0),
    currency: text(row, ["currency", "Currency"], "GTQ").replace("QTZ", "GTQ"),
    description: text(row, ["description", "Description"], itemName),
    short_description: text(row, ["short_description", "ShortDescription"]) || null,
    weight_kg: number(row, ["weight_kg", "WeightKg", "SalesUnitWeight"], 0),
    shipping_class: text(row, ["shipping_class", "ShippingClass"], "standard"),
    sap_sync_status: "synced",
    sap_last_sync_at: new Date().toISOString(),
    sap_raw_payload: row,
  };

  const payload = isNew
    ? {
        ...base,
        slug: `${slugify(itemName) || "producto"}-${slugify(itemCode) || crypto.randomUUID().slice(0, 8)}`,
        image: text(row, ["image", "Image", "image_url"], FALLBACK_IMAGE),
        images: [],
        specs: [],
        labels: [],
        is_active: bool(row, ["is_active", "Active", "valid"], true),
        ecommerce_status: "needs_enrichment",
        enrichment_status: "needs_enrichment",
        enrichment_required: true,
      }
    : {
        ...base,
        slug: existing.slug,
        ecommerce_status: existing.ecommerce_status,
        enrichment_status: existing.enrichment_status,
        enrichment_required: existing.enrichment_required,
        is_active: existing.is_active,
      };

  const { data: savedProduct, error } = await sb
    .from("products")
    .upsert(payload, { onConflict: "sap_item_code" })
    .select("id")
    .single();
  if (error) throw error;

  if (savedProduct?.id) {
    const { error: variantError } = await sb.from("product_variants").upsert(
      {
        product_id: savedProduct.id,
        sku: itemCode,
        barcode,
        name: itemName,
        attributes: {},
        price: number(row, ["price", "Price"], 0),
        price_delta: 0,
        is_active: bool(row, ["is_active", "Active", "valid"], true),
      },
      { onConflict: "sku" },
    );
    if (variantError) throw variantError;
  }

  return { sku: itemCode, action: isNew ? "created_needs_enrichment" : "updated_preserving_ecommerce_status" };
}

async function projectPrice(sb: SupabaseClient, row: JsonRecord) {
  const itemCode = text(row, ["item_code", "ItemCode", "sku", "SKU"]);
  if (isInvalidSapCode(itemCode)) throw new SkippedRowError("Missing or invalid item_code", "invalid_item_code");

  const price = number(row, ["price", "Price"], 0);
  const priceListCode = text(row, ["price_list", "PriceList", "price_list_code", "PriceListCode"], "1");
  const priceListName = text(row, ["price_list_name", "PriceListName"], `SAP ${priceListCode}`);
  const currency = text(row, ["currency", "Currency"], "GTQ").replace("QTZ", "GTQ");

  const { data: product, error: productError } = await sb
    .from("products")
    .select("id")
    .eq("sap_item_code", itemCode)
    .maybeSingle();
  if (productError) throw productError;
  if (!product?.id) throw new SkippedRowError(`Product not found for price SKU ${itemCode}`, "product_not_found");

  const { data: priceList, error: priceListError } = await sb
    .from("admin_price_lists")
    .upsert(
      {
        code: priceListCode,
        name: priceListName,
        customer_type: text(row, ["customer_type", "CustomerType"], "all").toLowerCase(),
        currency,
        is_active: true,
      },
      { onConflict: "code" },
    )
    .select("id")
    .single();
  if (priceListError) throw priceListError;

  const { error: itemError } = await sb
    .from("admin_price_list_items")
    .upsert(
      {
        price_list_id: priceList.id,
        product_id: product.id,
        price,
        min_qty: Math.max(1, number(row, ["min_qty", "MinQty"], 1)),
      },
      { onConflict: "price_list_id,product_id,min_qty" },
    );
  if (itemError) throw itemError;

  if (priceListCode === "1" || priceListCode.toUpperCase() === "B2C-GENERAL") {
    const { error } = await sb
      .from("products")
      .update({ price, currency, sap_last_sync_at: new Date().toISOString() })
      .eq("sap_item_code", itemCode);
    if (error) throw error;
  }

  return { sku: itemCode, price_list: priceListCode, price };
}

async function projectInventory(sb: SupabaseClient, row: JsonRecord) {
  const itemCode = text(row, ["item_code", "ItemCode", "sku", "SKU"]);
  const warehouseCode = text(row, ["warehouse_code", "WarehouseCode", "store_code", "StoreCode"]);
  if (isInvalidSapCode(itemCode) || isInvalidSapCode(warehouseCode)) {
    throw new SkippedRowError("Missing or invalid item_code or warehouse_code", "invalid_inventory_key");
  }

  const { data: product, error: productError } = await sb
    .from("products")
    .select("id")
    .eq("sap_item_code", itemCode)
    .maybeSingle();
  if (productError) throw productError;
  if (!product?.id) throw new SkippedRowError(`Product not found for inventory SKU ${itemCode}`, "product_not_found");

  const storeId = await ensureStore(sb, warehouseCode, row);
  if (!storeId) throw new Error(`Store not found for warehouse ${warehouseCode}`);

  const onHand = number(row, ["on_hand", "OnHand", "qty", "Quantity"], 0);
  const committed = number(row, ["committed", "Committed"], 0);
  const safetyStock = number(row, ["safety_stock", "SafetyStock"], 0);

  const { error } = await sb
    .from("inventory")
    .upsert(
      {
        product_id: product.id,
        store_id: storeId,
        qty: onHand,
        on_hand: onHand,
        committed,
        safety_stock: safetyStock,
        last_sap_sync_at: new Date().toISOString(),
      },
      { onConflict: "product_id,store_id" },
    );
  if (error) throw error;

  return { sku: itemCode, warehouse_code: warehouseCode, on_hand: onHand, committed, safety_stock: safetyStock };
}

async function projectCustomer(sb: SupabaseClient, row: JsonRecord) {
  const cardCode = text(row, ["card_code", "CardCode", "sap_card_code"]);
  if (isInvalidSapCode(cardCode)) throw new SkippedRowError("Missing or invalid card_code", "invalid_card_code");

  const nit = normalizeNit(text(row, ["AddID", "add_id", "FederalTaxID", "federal_tax_id", "LicTradNum", "lic_trad_num", "nit", "NIT", "tax_id"]));

  const { error } = await sb
    .from("sap_business_partners")
    .upsert(
      {
        sap_card_code: cardCode,
        card_name: text(row, ["legal_name", "card_name", "CardName", "name"]) || null,
        customer_type: text(row, ["customer_type", "CustomerType"], "B2C"),
        nit,
        email: text(row, ["email", "EmailAddress", "email_address"]) || null,
        phone: text(row, ["phone", "Phone1", "phone1"]) || null,
        credit_limit: number(row, ["credit_limit", "CreditLimit"], 0),
        price_list: text(row, ["price_list", "PriceList"]) || null,
        is_active: bool(row, ["is_active", "Active"], true),
        raw: row,
        last_sap_sync_at: new Date().toISOString(),
      },
      { onConflict: "sap_card_code" },
    );
  if (error) throw error;
  return { card_code: cardCode };
}

async function queueInvoiceEmailNotification(
  sb: SupabaseClient,
  params: {
    orderId: string;
    invoiceId?: string;
    invoiceNumber: string;
    docEntry: number;
    docNum: string;
    pdfUrl: string;
  },
) {
  if (!params.orderId || !params.invoiceId) return;

  const { data: existing } = await sb
    .from("notifications")
    .select("id")
    .eq("event_type", "invoice.issued")
    .contains("payload", { invoice_id: params.invoiceId })
    .limit(1);
  if (Array.isArray(existing) && existing.length > 0) return;

  const { data: order } = await sb
    .from("orders")
    .select("user_id, order_number")
    .eq("id", params.orderId)
    .maybeSingle();

  const payload = {
    order_id: params.orderId,
    order_number: isRecord(order) ? order.order_number : null,
    invoice_id: params.invoiceId,
    invoice_number: params.invoiceNumber,
    sap_doc_entry: params.docEntry,
    sap_doc_num: params.docNum || null,
    pdf_url: params.pdfUrl || null,
  };

  const notification = {
    user_id: isRecord(order) ? order.user_id ?? null : null,
    channel: "email",
    event_type: "invoice.issued",
    subject: `Factura RENOVA ${params.invoiceNumber}`,
    body: "Tu factura RENOVA fue emitida y esta lista para envio.",
    status: "pending",
    payload,
  };

  const { error } = await sb.from("notifications").insert(notification);
  if (!error) return;

  const { user_id: _userId, ...fallbackNotification } = notification;
  const { error: fallbackError } = await sb.from("notifications").insert(fallbackNotification);
  if (!fallbackError) return;

  await sb.from("error_recovery_tasks").insert({
    severity: "high",
    scope: "notifications",
    task_type: "invoice_email_queue_failed",
    entity_type: "orders",
    entity_id: params.orderId,
    idempotency_key: `invoice-email:${params.invoiceId}`,
    title: "No se pudo encolar email de factura",
    error: fallbackError.message,
    request_payload: payload,
    status: "open",
  });
}

async function projectInvoice(sb: SupabaseClient, row: JsonRecord) {
  const docEntry = number(row, ["doc_entry", "DocEntry"], Number.NaN);
  if (!Number.isFinite(docEntry)) throw new Error("Missing doc_entry");

  const orderId = text(row, ["order_id", "OrderId", "renova_order_id"]);
  const invoiceNumber = text(row, ["fiscal_number", "fel_uuid", "invoice_number", "InvoiceNumber"]);
  const docNum = text(row, ["doc_num", "DocNum"]);
  const pdfUrl = text(row, ["pdf_url", "PdfUrl", "invoice_pdf_url"]);

  const { data: invoice, error } = await sb
    .from("invoices")
    .upsert(
      {
        order_id: orderId || null,
        sap_doc_entry: docEntry,
        sap_doc_num: docNum || null,
        invoice_number: invoiceNumber || docNum || String(docEntry),
        fiscal_number: invoiceNumber || null,
        total: number(row, ["doc_total", "DocTotal", "total"], 0),
        subtotal: number(row, ["subtotal", "SubTotal", "doc_total", "DocTotal"], 0),
        tax: number(row, ["tax", "Tax"], 0),
        currency: text(row, ["currency", "Currency"], "GTQ").replace("QTZ", "GTQ"),
        status: text(row, ["status", "Status"], "issued"),
        pdf_url: pdfUrl || null,
        raw_payload: row,
        issued_at: text(row, ["issued_at", "DocDate"]) || new Date().toISOString(),
      },
      { onConflict: "sap_doc_entry" },
    )
    .select("id")
    .single();
  if (error) throw error;

  if (orderId) {
    const { error: orderError } = await sb
      .from("orders")
      .update({
        sap_invoice_doc_entry: docEntry,
        sap_invoice_doc_num: docNum || null,
        fiscal_number: invoiceNumber || null,
        status: "fulfillment_pending",
        recovery_status: "none",
      })
      .eq("id", orderId);
    if (orderError) throw orderError;

    await sb.from("order_status_history").insert({
      order_id: orderId,
      status: "sap_invoice_issued",
      notes: `SAP invoice ${docNum || docEntry} received`,
    });

    await queueInvoiceEmailNotification(sb, {
      orderId,
      invoiceId: typeof invoice?.id === "string" ? invoice.id : undefined,
      invoiceNumber: invoiceNumber || docNum || String(docEntry),
      docEntry,
      docNum,
      pdfUrl,
    });
  }

  return { sap_doc_entry: docEntry, invoice_id: invoice?.id, order_id: orderId || null };
}

async function projectInvoiceCancelled(sb: SupabaseClient, row: JsonRecord) {
  const docEntry = number(row, ["doc_entry", "DocEntry"], Number.NaN);
  if (!Number.isFinite(docEntry)) throw new Error("Missing doc_entry");

  const { data: invoice, error } = await sb
    .from("invoices")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), raw_payload: row })
    .eq("sap_doc_entry", docEntry)
    .select("order_id")
    .maybeSingle();
  if (error) throw error;

  if (invoice?.order_id) {
    await sb.from("order_status_history").insert({
      order_id: invoice.order_id,
      status: "sap_invoice_cancelled",
      notes: `SAP invoice ${docEntry} cancelled`,
    });
  }

  return { sap_doc_entry: docEntry, order_id: invoice?.order_id ?? null };
}

async function projectOrderSapAck(sb: SupabaseClient, row: JsonRecord) {
  const orderId = text(row, ["order_id", "OrderId", "renova_order_id"]);
  if (!orderId) throw new Error("Missing order_id");

  const docEntry = number(row, ["sap_doc_entry", "DocEntry", "doc_entry"], Number.NaN);
  const docNum = text(row, ["sap_doc_num", "DocNum", "doc_num"]);
  const sapStatus = text(row, ["status", "Status"], "sap_accepted");

  const { error } = await sb
    .from("orders")
    .update({
      sap_doc_entry: Number.isFinite(docEntry) ? docEntry : null,
      sap_doc_num: docNum || null,
      sap_sync_status: "synced",
      sap_synced_at: new Date().toISOString(),
      status: sapStatus,
    })
    .eq("id", orderId);
  if (error) throw error;

  await sb.from("sap_entity_mappings").upsert(
    {
      entity_type: "orders",
      entity_id: orderId,
      sap_object_type: "sales_order",
      sap_doc_entry: Number.isFinite(docEntry) ? docEntry : null,
      sap_doc_num: docNum || null,
      payload: row,
    },
    { onConflict: "entity_type,entity_id,sap_object_type" },
  );

  await sb.from("order_status_history").insert({
    order_id: orderId,
    status: "orders.sap_ack",
    notes: `SAP sales order ${docNum || docEntry || ""} accepted`,
  });

  return { order_id: orderId, sap_doc_entry: Number.isFinite(docEntry) ? docEntry : null, sap_doc_num: docNum || null };
}

async function projectRow(sb: SupabaseClient, event: string, row: JsonRecord) {
  switch (event) {
    case "catalog.products.upsert":
      return await projectProduct(sb, row);
    case "catalog.prices.upsert":
      return await projectPrice(sb, row);
    case "customers.upsert":
      return await projectCustomer(sb, row);
    case "inventory.upsert":
      return await projectInventory(sb, row);
    case "sap.invoice.upsert":
      return await projectInvoice(sb, row);
    case "sap.invoice.cancelled":
      return await projectInvoiceCancelled(sb, row);
    case "orders.sap_ack":
      return await projectOrderSapAck(sb, row);
    default:
      throw new Error(`No projector for ${event}`);
  }
}

async function createRecoveryTask(
  sb: SupabaseClient,
  evt: NormalizedEvent,
  row: JsonRecord,
  rowIndex: number,
  message: string,
) {
  await sb.from("error_recovery_tasks").insert({
    severity: "critical",
    task_type: "sap_event_projection_failed",
    entity_type: evt.event,
    entity_id: text(row, ["item_code", "ItemCode", "order_id", "OrderId", "doc_entry", "DocEntry"], `${rowIndex}`),
    idempotency_key: evt.idempotencyKey,
    correlation_id: evt.correlationId,
    error_message: message,
    payload: { row_index: rowIndex, row },
  });
}

function asCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asJsonRecordArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function summarizeRpcResult(event: string, data: unknown): JsonRecord[] {
  const payload = isRecord(data) ? data : {};
  const processed = asCount(payload.processed);
  const skipped = asCount(payload.skipped);
  const failed = asCount(payload.failed);
  const sampleErrors = asJsonRecordArray(payload.sample_errors);
  const results = asJsonRecordArray(payload.results);

  return [
    {
      ok: failed === 0,
      action: event,
      processed_count: processed,
      skipped_count: skipped,
      failed_count: failed,
      pending_count: asCount(payload.pending),
      sample_errors: sampleErrors,
      results: results.slice(0, 5),
    },
  ];
}

async function processBulkRows(sb: SupabaseClient, evt: NormalizedEvent) {
  const rpc =
    evt.event === "price_lists.sync.batch"
      ? "sap_bulk_upsert_price_lists"
      : evt.event === "catalog.products.upsert"
        ? "sap_bulk_upsert_products"
        : evt.event === "catalog.prices.upsert"
          ? "sap_bulk_upsert_prices"
          : evt.event === "customers.upsert"
            ? "sap_bulk_upsert_customers"
            : "sap_bulk_upsert_inventory";

  const { data, error } = await sb.rpc(rpc, {
    p_rows: evt.rows,
    p_correlation_id: evt.correlationId ?? null,
    p_idempotency_key: evt.idempotencyKey ?? null,
  });

  if (error) throw error;
  return summarizeRpcResult(evt.event, data);
}

function countResultRows(results: JsonRecord[], key: "processed" | "skipped" | "failed") {
  const explicitKey = `${key}_count`;
  const explicit = results.some((result) => typeof result[explicitKey] === "number");
  if (explicit) {
    return results.reduce((sum, result) => sum + asCount(result[explicitKey]), 0);
  }

  if (key === "processed") {
    return results.filter((result) => result.ok === true && result.skipped !== true).length;
  }
  if (key === "skipped") {
    return results.filter((result) => result.skipped === true).length;
  }
  return results.filter((result) => result.ok !== true && result.skipped !== true).length;
}

function compactResults(results: JsonRecord[]) {
  const sampleErrors: JsonRecord[] = [];
  for (const result of results) {
    for (const nested of asJsonRecordArray(result.sample_errors)) {
      if (sampleErrors.length < 20) sampleErrors.push(nested);
    }
    if ((result.ok !== true || result.skipped === true) && sampleErrors.length < 20) {
      sampleErrors.push(result);
    }
  }

  if (sampleErrors.length > 0) {
    return {
      results: sampleErrors,
      sample_errors: sampleErrors,
    };
  }

  const summaryRows = results
    .map((result) => {
      const { sample_errors: _sampleErrors, results: _nestedResults, ...summary } = result;
      return summary;
    })
    .slice(0, 5);

  return {
    results:
      summaryRows.length > 0
        ? summaryRows
        : [{ ok: true, action: "processed" }],
    sample_errors: [],
  };
}

function compactEventPayload(evt: NormalizedEvent) {
  return {
    event_type: evt.event,
    timestamp: evt.timestamp,
    correlation_id: evt.correlationId,
    idempotency_key: evt.idempotencyKey,
    source: evt.source,
    payload_count: evt.payloadCount,
    row_count: evt.expectedRows,
    data_shape: Array.isArray(evt.data) ? "array" : isRecord(evt.data) ? "object" : typeof evt.data,
    sample: evt.rows.filter(isRecord).slice(0, 3).map((row) => {
      const itemCode = text(row, ["item_code", "ItemCode", "sku", "SKU"]);
      const warehouseCode = text(row, ["warehouse_code", "WarehouseCode", "store_code", "StoreCode"]);
      const priceList = text(row, ["price_list", "PriceList", "price_list_code"]);
      const priceListNo = text(row, ["price_list_no", "PriceListNo", "list_num", "ListNum"]);
      const cardCode = text(row, ["card_code", "CardCode"]);
      return {
        item_code: itemCode || undefined,
        warehouse_code: warehouseCode || undefined,
        price_list: priceList || priceListNo || undefined,
        card_code: cardCode || undefined,
      };
    }),
  };
}

function minimalRowPayload(row: unknown): JsonRecord {
  if (!isRecord(row)) return { raw_type: typeof row };
  const itemCode = text(row, ["item_code", "ItemCode", "sku", "SKU"]);
  const warehouseCode = text(row, ["warehouse_code", "WarehouseCode", "store_code", "StoreCode"]);
  const priceList =
    text(row, ["price_list", "PriceList", "price_list_code", "PriceListCode"]) ||
    text(row, ["price_list_no", "PriceListNo", "list_num", "ListNum"]);
  const cardCode = text(row, ["card_code", "CardCode", "sap_card_code"]);
  const externalId = text(row, ["external_id", "ExternalId", "externalId"]);
  const name = text(row, ["item_name", "ItemName", "name", "Name", "legal_name", "LegalName", "card_name", "CardName"]);
  return {
    external_id: externalId || undefined,
    item_code: itemCode || undefined,
    sku: itemCode || undefined,
    warehouse_code: warehouseCode || undefined,
    price_list: priceList || undefined,
    card_code: cardCode || undefined,
    name: name || undefined,
  };
}

function sampleRowErrors(evt: NormalizedEvent, reason: string, limit = 20) {
  const rows = evt.rows.length > 0 ? evt.rows.slice(0, limit) : Array.from({ length: Math.min(evt.expectedRows || 1, limit) }, () => ({}));
  return rows.map((row, index) => {
    const payload = minimalRowPayload(row);
    return {
      ok: false,
      index,
      reason,
      item_code: payload.item_code,
      sku: payload.sku,
      warehouse_code: payload.warehouse_code,
      price_list: payload.price_list,
      card_code: payload.card_code,
      payload,
    };
  });
}

async function processRows(sb: SupabaseClient, evt: NormalizedEvent) {
  const results: JsonRecord[] = [];

  if (evt.event === "bridge.heartbeat") {
    const heartbeatRows = evt.rows.length > 0 ? evt.rows : Array.from({ length: evt.expectedRows }, () => ({}));
    return heartbeatRows.map((row, index) => ({
      index,
      ok: true,
      action: "heartbeat",
      timestamp: evt.timestamp,
      row,
    }));
  }

  if (
    evt.event === "price_lists.sync.batch" ||
    evt.event === "catalog.products.upsert" ||
    evt.event === "catalog.prices.upsert" ||
    evt.event === "customers.upsert" ||
    evt.event === "inventory.upsert"
  ) {
    return await processBulkRows(sb, evt);
  }

  for (let index = 0; index < evt.rows.length; index++) {
    const row = evt.rows[index];
    if (!isRecord(row)) {
      const message = "payload.data row is not an object";
      await createRecoveryTask(sb, evt, { raw: row }, index, message).catch((recoveryError) => {
        console.error("[sap-events-handler] recovery task failed", recoveryError);
      });
      results.push({ index, ok: true, skipped: true, reason: "invalid_row_shape", error: message });
      continue;
    }

    try {
      const projection = await projectRow(sb, evt.event, row);
      results.push({ index, ok: true, ...projection });
    } catch (error) {
      const message = formatError(error);
      await createRecoveryTask(sb, evt, row, index, message).catch((recoveryError) => {
        console.error("[sap-events-handler] recovery task failed", recoveryError);
      });
      if (error instanceof SkippedRowError) {
        results.push({ index, ok: true, skipped: true, reason: error.reason, error: message });
      } else {
        results.push({ index, ok: false, error: message });
      }
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WebhookSecret");
  if (!expectedSecret) return json({ ok: false, error: "Server misconfiguration" }, 500);
  if (req.headers.get("x-webhook-secret") !== expectedSecret) {
    return json({ ok: false, error: "Invalid webhook secret" }, 401);
  }

  let body: MiddlewareEvent;
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

  const incoming = Array.isArray(body.events) ? body.events : [body];
  const eventResponses: JsonRecord[] = [];

  for (const raw of incoming) {
    const evt = normalize(raw);

    if (!evt.event || !ACCEPTED_EVENTS.has(evt.event)) {
      eventResponses.push({
        ok: false,
        event: evt.event,
        received: evt.rows.length,
        expected_rows: evt.expectedRows,
        processed: 0,
        failed: evt.expectedRows || 1,
        correlation_id: evt.correlationId,
        idempotency_key: evt.idempotencyKey,
        results: [{ ok: false, error: "Unknown event type" }],
      });
      continue;
    }

    if (!evt.correlationId || !evt.idempotencyKey) {
      eventResponses.push({
        ok: false,
        event: evt.event,
        received: evt.rows.length,
        expected_rows: evt.expectedRows,
        processed: 0,
        failed: evt.expectedRows || 1,
        correlation_id: evt.correlationId,
        idempotency_key: evt.idempotencyKey,
        results: [{ ok: false, error: "Missing correlation_id or idempotency_key" }],
      });
      continue;
    }

    await sb.rpc("sap_reclaim_stuck_sap_event", {
      p_idempotency_key: evt.idempotencyKey,
      p_stuck_after_seconds: 900,
    }).then(({ error }) => {
      if (error) console.error("[sap-events-handler] stuck reclaim failed", error.message);
    });

    let sapEventId: string | undefined;
    try {
      const { data, error } = await sb
        .from("sap_events")
        .insert({
          event_type: evt.event,
          event_timestamp: evt.timestamp,
          correlation_id: evt.correlationId,
          idempotency_key: evt.idempotencyKey,
          source: evt.source,
          payload_count: evt.payloadCount,
          expected_rows: evt.expectedRows,
          payload: compactEventPayload(evt),
          status: "received",
          received_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error?.code === "23505") {
        const { data: existing, error: existingError } = await sb
          .from("sap_events")
          .select("id, status, received_at, processed_at, processing_error, expected_rows, processed_rows, skipped_rows, failed_rows, results, sample_errors")
          .eq("idempotency_key", evt.idempotencyKey)
          .not("status", "in", "(expired,failed)")
          .order("received_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) throw new Error("Duplicate idempotency key found but active event was not readable");

        const previousResults = Array.isArray(existing?.results) ? (existing.results as JsonRecord[]) : [];
        const sampleErrors = Array.isArray(existing?.sample_errors) ? (existing.sample_errors as JsonRecord[]) : [];
        const previousStatus = typeof existing?.status === "string" ? existing.status : "received";
        const skippedRows = Number(existing?.skipped_rows ?? previousResults.filter((result) => result.skipped === true).length);
        const processedRows = Number(existing?.processed_rows ?? previousResults.filter((result) => result.ok === true).length);
        const failedRows = Number(
          existing?.failed_rows ?? previousResults.filter((result) => result.ok !== true && result.skipped !== true).length,
        );
        const hasPreviousResult =
          previousResults.length > 0 ||
          processedRows > 0 ||
          failedRows > 0 ||
          Boolean(existing?.processed_at);

        if (!hasPreviousResult && ["received", "processing"].includes(previousStatus)) {
          eventResponses.push({
            ok: true,
            status: "processing",
            retry_after_seconds: 60,
            event: evt.event,
            received: evt.rows.length,
            expected_rows: existing?.expected_rows ?? evt.expectedRows,
            processed: 0,
            skipped: 0,
            failed: 0,
            correlation_id: evt.correlationId,
            idempotency_key: evt.idempotencyKey,
            sap_event_id: existing?.id,
            duplicate: true,
            results: [],
          });
          continue;
        }

        const previousOk = hasPreviousResult && failedRows === 0 && !existing?.processing_error;
        eventResponses.push({
          ok: previousOk,
          status: previousOk ? "completed" : "failed",
          event: evt.event,
          received: evt.rows.length,
          expected_rows: existing?.expected_rows ?? evt.expectedRows,
          processed: processedRows,
          skipped: skippedRows,
          failed: hasPreviousResult ? failedRows : evt.expectedRows,
          correlation_id: evt.correlationId,
          idempotency_key: evt.idempotencyKey,
          sap_event_id: existing?.id,
          duplicate: true,
          results: previousResults,
          sample_errors: sampleErrors,
          ...(hasPreviousResult
            ? existing?.processing_error
              ? { error: existing.processing_error }
              : {}
            : { error: "Event is already being processed" }),
        });
        continue;
      }

      if (error) throw error;
      sapEventId = data?.id;
    } catch (error) {
      const message = formatError(error);
      eventResponses.push({
        ok: false,
        event: evt.event,
        received: evt.rows.length,
        expected_rows: evt.expectedRows,
        processed: 0,
        failed: evt.expectedRows || 1,
        correlation_id: evt.correlationId,
        idempotency_key: evt.idempotencyKey,
        results: [{ ok: false, error: message }],
      });
      continue;
    }

    let results: JsonRecord[];
    try {
      results = await processRows(sb, evt);
    } catch (error) {
      const message = formatError(error);
      const sampleErrors = sampleRowErrors(evt, message);
      results = [
        {
          ok: false,
          action: evt.event,
          processed_count: 0,
          skipped_count: 0,
          failed_count: evt.expectedRows || 1,
          error: message,
          sample_errors: sampleErrors,
        },
      ];
    }

    const processed = countResultRows(results, "processed");
    const skipped = countResultRows(results, "skipped");
    const failed = countResultRows(results, "failed");
    const ok = failed === 0 && processed + skipped === evt.expectedRows;
    const processingError = failed > 0 ? `Processed ${processed}/${evt.expectedRows}; skipped ${skipped}; failed ${failed}` : null;
    const compact = compactResults(results);

    if (sapEventId) {
      await sb
        .from("sap_events")
        .update({
          status: ok ? (skipped > 0 ? "processed_with_skips" : "processed") : "failed",
          processed_at: ok ? new Date().toISOString() : null,
          processing_error: processingError,
          processed_rows: processed,
          skipped_rows: skipped,
          failed_rows: failed,
          sample_errors: compact.sample_errors,
          results: compact.results,
        })
        .eq("id", sapEventId);
    }

    eventResponses.push({
      ok,
      event: evt.event,
      received: evt.rows.length,
      expected_rows: evt.expectedRows,
      processed,
      skipped,
      failed,
      correlation_id: evt.correlationId,
      idempotency_key: evt.idempotencyKey,
      sap_event_id: sapEventId,
      results: compact.results,
      sample_errors: compact.sample_errors,
    });
  }

  if (eventResponses.length === 1) return json(eventResponses[0]);

  return json({
    ok: eventResponses.every((response) => response.ok === true),
    received: eventResponses.reduce((sum, response) => sum + Number(response.received ?? 0), 0),
    expected_rows: eventResponses.reduce((sum, response) => sum + Number(response.expected_rows ?? 0), 0),
    processed: eventResponses.reduce((sum, response) => sum + Number(response.processed ?? 0), 0),
    skipped: eventResponses.reduce((sum, response) => sum + Number(response.skipped ?? 0), 0),
    failed: eventResponses.reduce((sum, response) => sum + Number(response.failed ?? 0), 0),
    results: eventResponses,
  });
});
