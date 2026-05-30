// Supabase Edge Function: sap-events-handler
// Receives normalized events from the SAP B1 on-premise middleware and
// ecommerce payment/order flows. The function only returns results[].ok=true
// after the event is persisted in sap_events.

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPayloadData(payload: unknown) {
  if (isRecord(payload) && "data" in payload) return payload.data;
  return payload ?? null;
}

function normalizeEvent(evt: SapEvent) {
  const event = evt.event;
  const timestamp = evt.timestamp ?? new Date().toISOString();
  const payload = isRecord(evt.payload) ? evt.payload : {};
  const correlationId =
    evt.correlation_id ?? (typeof payload.correlation_id === "string" ? payload.correlation_id : undefined);
  const idempotencyKey =
    evt.idempotency_key ?? (typeof payload.idempotency_key === "string" ? payload.idempotency_key : undefined);
  const source = evt.source ?? (typeof payload.source === "string" ? payload.source : undefined);
  const data = getPayloadData(evt.payload);

  return {
    event,
    timestamp,
    correlationId,
    idempotencyKey,
    source,
    data,
    raw: evt,
  };
}

function validateEvent(evt: ReturnType<typeof normalizeEvent>) {
  if (!evt.event || !ACCEPTED_EVENTS.has(evt.event)) return "Unknown event type";
  if (evt.event === "bridge.heartbeat") return undefined;
  if (!evt.correlationId) return "Missing correlation_id";
  if (!evt.idempotencyKey) return "Missing idempotency_key";
  if (!evt.source) return "Missing source";
  if (evt.data === null || evt.data === undefined) return "Missing payload.data";
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WebhookSecret");
  if (!expectedSecret) {
    console.error("[sap-events-handler] WebhookSecret not configured");
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const provided = req.headers.get("x-webhook-secret");
  if (!provided || provided !== expectedSecret) {
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
    console.error("[sap-events-handler] Supabase service credentials not configured");
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const incoming: SapEvent[] = Array.isArray(body.events) ? body.events : [body];
  const results: Array<{
    event: string;
    ok: boolean;
    idempotency_key?: string;
    correlation_id?: string;
    sap_event_id?: string;
    duplicate?: boolean;
    error?: string;
  }> = [];

  for (const rawEvent of incoming) {
    const evt = normalizeEvent(rawEvent);
    const validationError = validateEvent(evt);
    if (validationError) {
      results.push({
        event: String(evt.event),
        ok: false,
        idempotency_key: evt.idempotencyKey,
        correlation_id: evt.correlationId,
        error: validationError,
      });
      continue;
    }

    try {
      const record = {
        event_type: evt.event,
        event_timestamp: evt.timestamp,
        correlation_id: evt.correlationId ?? `heartbeat-${evt.timestamp}`,
        idempotency_key: evt.idempotencyKey ?? `heartbeat-${evt.timestamp}`,
        source: evt.source ?? "SAP_B1",
        payload: {
          event: evt.event,
          timestamp: evt.timestamp,
          correlation_id: evt.correlationId,
          idempotency_key: evt.idempotencyKey,
          source: evt.source,
          data: evt.data,
          raw: evt.raw,
        },
        received_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("sap_events")
        .insert(record)
        .select("id, received_at")
        .single();

      if (error?.code === "23505") {
        const { data: duplicate, error: duplicateError } = await supabase
          .from("sap_events")
          .select("id, received_at")
          .eq("idempotency_key", record.idempotency_key)
          .single();

        if (duplicateError) throw duplicateError;

        results.push({
          event: evt.event,
          ok: true,
          idempotency_key: record.idempotency_key,
          correlation_id: record.correlation_id,
          sap_event_id: String(duplicate?.id ?? ""),
          duplicate: true,
        });
        continue;
      }

      if (error) throw error;

      results.push({
        event: evt.event,
        ok: true,
        idempotency_key: record.idempotency_key,
        correlation_id: record.correlation_id,
        sap_event_id: String(data?.id ?? ""),
        duplicate: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sap-events-handler] ${evt.event} error:`, message);
      results.push({
        event: evt.event,
        ok: false,
        idempotency_key: evt.idempotencyKey,
        correlation_id: evt.correlationId,
        error: message,
      });
    }
  }

  const ok = results.every((result) => result.ok);
  return json({
    ok,
    received: incoming.length,
    processed: results.filter((result) => result.ok).length,
    results,
  });
});
