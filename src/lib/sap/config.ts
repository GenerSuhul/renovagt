/**
 * SAP Business One HANA — middleware integration configuration.
 *
 * The RENOVA frontend does NOT talk to SAP directly. All requests are
 * proxied through an external middleware service that exposes a REST API
 * mirroring SAP's Service Layer endpoints.
 *
 * Configure the runtime values via environment variables (server-side only):
 *   - SAP_MIDDLEWARE_URL
 *   - SAP_MIDDLEWARE_API_KEY
 *   - SAP_COMPANY_DB
 *
 * NOTE: Endpoints, payloads and authentication scheme are intentionally
 * abstracted here so they can be swapped without touching business code.
 */

export interface SapMiddlewareConfig {
  baseUrl: string;
  apiKey: string;
  companyDb: string;
  timeoutMs: number;
  retry: { attempts: number; backoffMs: number };
}

export const SAP_ENDPOINTS = {
  // Auth
  login: "/auth/login",
  // Catalog
  products: "/catalog/products",
  productBySku: (sku: string) => `/catalog/products/${encodeURIComponent(sku)}`,
  categories: "/catalog/categories",
  prices: "/catalog/prices",
  pricesBySku: (sku: string) => `/catalog/prices/${encodeURIComponent(sku)}`,
  // Inventory
  inventory: "/inventory/stock",
  inventoryByStore: (storeId: string) => `/inventory/stock/${encodeURIComponent(storeId)}`,
  // Customers
  customers: "/customers",
  customerByEmail: (email: string) => `/customers/by-email/${encodeURIComponent(email)}`,
  // Orders
  orders: "/orders",
  orderById: (id: string) => `/orders/${encodeURIComponent(id)}`,
  // Invoices / credit notes
  invoiceForOrder: (orderId: string) => `/orders/${encodeURIComponent(orderId)}/invoice`,
  invoiceByOrder: (orderId: string) => `/invoices/by-order/${encodeURIComponent(orderId)}`,
  creditNotes: "/credit-notes",
  // Stores / Warehouses
  stores: "/stores",
  // Promotions
  promotions: "/promotions",
  // Shipping
  shipments: "/shipments",
  shipmentsByOrder: (orderId: string) => `/shipments/by-order/${encodeURIComponent(orderId)}`,
  shippingStatus: (orderId: string) => `/shipping/${encodeURIComponent(orderId)}/status`,
} as const;

export const SAP_SYNC_JOBS = {
  products: { cron: "*/15 * * * *", direction: "sap->renova" },
  inventory: { cron: "*/5 * * * *", direction: "sap->renova" },
  prices: { cron: "*/30 * * * *", direction: "sap->renova" },
  customers: { cron: "0 * * * *", direction: "bidirectional" },
  orders: { cron: "*/2 * * * *", direction: "renova->sap" },
  stores: { cron: "0 0 * * *", direction: "sap->renova" },
} as const;

export function loadSapConfig(): SapMiddlewareConfig {
  return {
    baseUrl: process.env.SAP_MIDDLEWARE_URL ?? "",
    apiKey: process.env.SAP_MIDDLEWARE_API_KEY ?? "",
    companyDb: process.env.SAP_COMPANY_DB ?? "",
    timeoutMs: 15_000,
    retry: { attempts: 3, backoffMs: 1_000 },
  };
}
