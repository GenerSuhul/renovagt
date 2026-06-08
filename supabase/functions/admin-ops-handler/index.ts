import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(body: JsonRecord, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function bool(body: JsonRecord, key: string, fallback = false) {
  const value = body[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function number(body: JsonRecord, key: string, fallback = 0) {
  const value = body[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
}

const productColumns = new Set([
  "name",
  "slug",
  "price",
  "original_price",
  "category_id",
  "short_description",
  "description",
  "ecommerce_status",
  "enrichment_status",
  "enrichment_required",
  "is_active",
  "image",
  "images",
  "labels",
  "brand_id",
]);

const FALLBACK_PRODUCT_IMAGE = "https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png";

async function syncProductGallery(service: ReturnType<typeof createClient>, productId: string) {
  const { data, error } = await service
    .from("product_images")
    .select("url,image_url,is_primary,sort_order,created_at")
    .eq("product_id", productId);
  if (error) throw error;

  const urls = ((data ?? []) as JsonRecord[])
    .map((image) => ({
      url: String(image.image_url || image.url || "").trim(),
      isPrimary: image.is_primary === true,
      sortOrder: typeof image.sort_order === "number" ? image.sort_order : Number(image.sort_order ?? 0),
      createdAt: String(image.created_at ?? ""),
    }))
    .filter((image) => image.url)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((image) => image.url);

  if (urls.length === 0) {
    const { error: updateError } = await service
      .from("products")
      .update({ image: FALLBACK_PRODUCT_IMAGE, images: [], updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (updateError) throw updateError;
    return;
  }
  const { error: updateError } = await service
    .from("products")
    .update({ image: urls[0], images: urls, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (updateError) throw updateError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ ok: false, error: "Server misconfiguration" }, 500);
  }

  const token = bearer(req);
  if (!token) return json({ ok: false, error: "Missing Authorization bearer token" }, 401);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return json({ ok: false, error: "Invalid or expired JWT" }, 401);

  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("role, status")
    .eq("id", userData.user.id)
    .maybeSingle();
  const role = String((profile as JsonRecord | null)?.role ?? "");
  const status = String((profile as JsonRecord | null)?.status ?? "active");
  if (profileError || status !== "active" || !["admin", "super_admin"].includes(role)) {
    return json({ ok: false, error: "Admin role required" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!isRecord(body)) return json({ ok: false, error: "JSON object body is required" }, 400);

  const action = text(body, "action");
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (action === "expire_inventory_reservations") {
      const { data, error } = await service.rpc("expire_inventory_reservations");
      if (error) throw error;
      return json({ ok: true, action, expired: data ?? 0 });
    }

    if (action === "release_order_reservations") {
      const orderId = text(body, "order_id");
      if (!orderId) return json({ ok: false, error: "order_id is required" }, 400);
      const reason = text(body, "reason") || "manual";
      const { data, error } = await service.rpc("release_order_reservations", {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw error;
      return json({ ok: true, action, released: data ?? 0 });
    }

    if (action === "resolve_recovery_task") {
      const taskId = text(body, "task_id");
      if (!taskId) return json({ ok: false, error: "task_id is required" }, 400);
      const { error } = await service
        .from("error_recovery_tasks")
        .update({
          status: "resolved",
          response_payload: {
            resolved_by: userData.user.id,
            resolved_at: new Date().toISOString(),
            notes: text(body, "notes") || "Resolved from admin",
          },
        })
        .eq("id", taskId);
      if (error) throw error;
      return json({ ok: true, action, task_id: taskId });
    }

    if (action === "retry_integration_event") {
      const eventId = text(body, "event_id");
      if (!eventId) return json({ ok: false, error: "event_id is required" }, 400);
      const { error } = await service
        .from("integration_event_queue")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", eventId);
      if (error) throw error;
      return json({ ok: true, action, event_id: eventId });
    }

    if (action === "update_system_setting") {
      const key = text(body, "key");
      if (!key) return json({ ok: false, error: "key is required" }, 400);
      const value = body.value;
      if (!isRecord(value)) return json({ ok: false, error: "value object is required" }, 400);
      const { error } = await service
        .from("system_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;
      return json({ ok: true, action, key });
    }

    if (action === "update_product") {
      const productId = text(body, "product_id");
      if (!productId) return json({ ok: false, error: "product_id is required" }, 400);
      const rawPayload = body.payload;
      if (!isRecord(rawPayload)) return json({ ok: false, error: "payload object is required" }, 400);

      const payload: JsonRecord = {};
      for (const [key, value] of Object.entries(rawPayload)) {
        if (productColumns.has(key)) payload[key] = value;
      }
      payload.updated_at = new Date().toISOString();

      const { data, error } = await service
        .from("products")
        .update(payload)
        .eq("id", productId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, action, product_id: productId, product: data });
    }

    if (action === "create_product_image") {
      const productId = text(body, "product_id");
      const url = text(body, "url") || text(body, "image_url");
      if (!productId) return json({ ok: false, error: "product_id is required" }, 400);
      if (!url) return json({ ok: false, error: "url is required" }, 400);

      const isPrimary = bool(body, "is_primary");
      if (isPrimary) {
        const { error } = await service.from("product_images").update({ is_primary: false }).eq("product_id", productId);
        if (error) throw error;
      }

      const alt = text(body, "alt") || text(body, "alt_text") || null;
      const { data, error } = await service
        .from("product_images")
        .insert({
          product_id: productId,
          url,
          image_url: url,
          storage_path: text(body, "storage_path") || null,
          alt,
          alt_text: alt,
          sort_order: number(body, "sort_order"),
          is_primary: isPrimary,
        })
        .select("*")
        .single();
      if (error) throw error;
      await syncProductGallery(service, productId);
      return json({ ok: true, action, product_id: productId, image: data });
    }

    if (action === "set_primary_product_image") {
      const productId = text(body, "product_id");
      const imageId = text(body, "image_id");
      if (!productId) return json({ ok: false, error: "product_id is required" }, 400);
      if (!imageId) return json({ ok: false, error: "image_id is required" }, 400);

      const { error: resetError } = await service.from("product_images").update({ is_primary: false }).eq("product_id", productId);
      if (resetError) throw resetError;
      const { data, error } = await service
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", imageId)
        .eq("product_id", productId)
        .select("*")
        .single();
      if (error) throw error;
      await syncProductGallery(service, productId);
      return json({ ok: true, action, product_id: productId, image: data });
    }

    if (action === "delete_product_image") {
      const productId = text(body, "product_id");
      const imageId = text(body, "image_id");
      if (!productId) return json({ ok: false, error: "product_id is required" }, 400);
      if (!imageId) return json({ ok: false, error: "image_id is required" }, 400);

      const { error } = await service.from("product_images").delete().eq("id", imageId).eq("product_id", productId);
      if (error) throw error;
      await syncProductGallery(service, productId);
      return json({ ok: true, action, product_id: productId, image_id: imageId });
    }

    return json({ ok: false, error: "Unknown action" }, 400);
  } catch (error) {
    return json({ ok: false, action, error: error instanceof Error ? error.message : String(error) }, 422);
  }
});
