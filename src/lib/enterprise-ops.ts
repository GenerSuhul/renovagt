import {
  createAdminRecord,
  listAdminRecords,
  updateAdminRecord,
  type AdminTable,
} from "@/lib/admin-crud";

type DbRecord = Record<string, unknown>;

export type QueueEvent = {
  eventType: string;
  aggregateType: string;
  aggregateId?: string;
  payload?: DbRecord;
};

export async function enqueueEnterpriseEvent(event: QueueEvent) {
  return createAdminRecord("integration_event_queue", {
    event_type: event.eventType,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId ?? null,
    payload: event.payload ?? {},
    status: "pending",
  });
}

export async function requestForzaQuote(payload: {
  orderId: string;
  originStoreId?: string;
  destination: DbRecord;
  weightKg?: number;
  volumetricWeight?: number;
  packageCount?: number;
}) {
  const shipment = await createAdminRecord("shipments", {
    order_id: payload.orderId,
    origin_store_id: payload.originStoreId ?? null,
    carrier: "FORZA",
    status: "quote_requested",
    destination: payload.destination,
    weight_kg: payload.weightKg ?? null,
    volumetric_weight: payload.volumetricWeight ?? null,
    package_count: payload.packageCount ?? 1,
  });

  await enqueueEnterpriseEvent({
    eventType: "forza.quote_requested",
    aggregateType: "shipments",
    aggregateId: String(shipment.id ?? ""),
    payload: shipment,
  });

  return shipment;
}

export async function reserveRealtimeStock(payload: {
  productId: string;
  storeId: string;
  qty: number;
  orderId?: string;
  expiresAt?: string;
}) {
  const reservation = await createAdminRecord("inventory_reservations", {
    product_id: payload.productId,
    store_id: payload.storeId,
    order_id: payload.orderId ?? null,
    qty: payload.qty,
    status: "reserved",
    expires_at: payload.expiresAt ?? null,
  });

  await enqueueEnterpriseEvent({
    eventType: "inventory.reserved",
    aggregateType: "inventory_reservations",
    aggregateId: String(reservation.id ?? ""),
    payload: reservation,
  });

  return reservation;
}

export async function markProductImagePrimary(imageId: string, productId: string) {
  await enqueueEnterpriseEvent({
    eventType: "product.media.primary_changed",
    aggregateType: "product_images",
    aggregateId: imageId,
    payload: { product_id: productId },
  });

  return updateAdminRecord("product_images", imageId, { is_primary: true });
}

export async function notifyCustomer(payload: {
  channel: "email" | "sms" | "whatsapp" | "push" | "in_app";
  eventType: string;
  subject?: string;
  body?: string;
  customerAccountId?: string;
  metadata?: DbRecord;
}) {
  return createAdminRecord("notifications", {
    channel: payload.channel,
    event_type: payload.eventType,
    subject: payload.subject ?? null,
    body: payload.body ?? null,
    customer_account_id: payload.customerAccountId ?? null,
    payload: payload.metadata ?? {},
    status: "pending",
  });
}

export async function loadEnterpriseRecords(table: AdminTable, columns = "*") {
  return listAdminRecords(table, columns);
}
