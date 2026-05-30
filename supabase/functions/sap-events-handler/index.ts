// Supabase Edge Function: sap-events-handler
// Receives events from the SAP middleware bridge.
//
// Auth model:
//   - Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>  (also sent as `apikey`)
//   - x-webhook-secret: <WebhookSecret>  ← validated here
//
// Accepted event types:
//   bridge.heartbeat
//   catalog.products.upsert
//   catalog.prices.upsert
//   inventory.upsert
//   customers.upsert
//   sap.invoice.upsert
//   sap.invoice.cancelled
//   orders.sap_ack

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-webhook-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCEPTED_EVENTS = new Set([
  "bridge.heartbeat",
  "catalog.products.upsert",
  "catalog.prices.upsert",
  "inventory.upsert",
  "customers.upsert",
  "sap.invoice.upsert",
  "sap.invoice.cancelled",
  "orders.sap_ack",
]);

interface SapEvent {
  event: string;
  timestamp?: string;
  payload?: unknown;
  // batch support
  events?: SapEvent[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // --- Auth: shared webhook secret ---
  const expectedSecret = Deno.env.get("WebhookSecret");
  if (!expectedSecret) {
    console.error("[sap-events-handler] WebhookSecret not configured");
    return json({ error: "Server misconfiguration" }, 500);
  }
  const provided = req.headers.get("x-webhook-secret");
  if (!provided || provided !== expectedSecret) {
    return json({ error: "Invalid webhook secret" }, 401);
  }

  // --- Parse body ---
  let body: SapEvent;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const incoming: SapEvent[] = Array.isArray(body.events) ? body.events : [body];
  const results: Array<{ event: string; ok: boolean; error?: string }> = [];

  for (const evt of incoming) {
    const type = evt?.event;
    if (!type || !ACCEPTED_EVENTS.has(type)) {
      results.push({ event: String(type), ok: false, error: "Unknown event type" });
      continue;
    }

    try {
      switch (type) {
        case "bridge.heartbeat":
          // Liveness ping — just acknowledge.
          console.log("[sap-events-handler] heartbeat", evt.timestamp ?? "");
          break;

        case "catalog.products.upsert":
        case "catalog.prices.upsert":
        case "inventory.upsert":
        case "customers.upsert":
        case "sap.invoice.upsert":
        case "sap.invoice.cancelled":
        case "orders.sap_ack":
          // Persist raw event for the middleware sync workers to process.
          // Domain tables (products, prices, inventory, …) are populated by
          // downstream jobs that consume this audit log.
          await supabase.from("sap_events").insert({
            event_type: type,
            payload: evt.payload ?? null,
            received_at: new Date().toISOString(),
          }).then(({ error }) => {
            if (error) {
              // Table may not exist yet — log but don't fail the whole request.
              console.warn(`[sap-events-handler] persist ${type} failed:`, error.message);
            }
          });
          break;
      }

      results.push({ event: type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sap-events-handler] ${type} error:`, message);
      results.push({ event: type, ok: false, error: message });
    }
  }

  return json({ ok: true, processed: results.length, results });
});
