/**
 * High-level service facades over the SAP middleware HTTP client.
 * Each function maps a RENOVA domain operation to an endpoint defined
 * in `./config.ts`. Replace the placeholder bodies once the middleware
 * contract is finalized.
 */

import { SAP_ENDPOINTS } from "./config";
import { sapFetch } from "./client";
import type {
  SapCustomerDTO,
  SapInventoryDTO,
  SapOrderDTO,
  SapProductDTO,
  SapStoreDTO,
} from "./dtos";

export const SapProductsService = {
  list: (q?: { search?: string; page?: number; pageSize?: number }) =>
    sapFetch<SapProductDTO[]>(SAP_ENDPOINTS.products, { query: q }),
  bySku: (sku: string) => sapFetch<SapProductDTO>(SAP_ENDPOINTS.productBySku(sku)),
};

export const SapInventoryService = {
  all: () => sapFetch<SapInventoryDTO[]>(SAP_ENDPOINTS.inventory),
  byStore: (storeId: string) => sapFetch<SapInventoryDTO[]>(SAP_ENDPOINTS.inventoryByStore(storeId)),
};

export const SapCustomersService = {
  upsert: (customer: Partial<SapCustomerDTO>) =>
    sapFetch<SapCustomerDTO>(SAP_ENDPOINTS.customers, { method: "POST", body: customer }),
  byEmail: (email: string) => sapFetch<SapCustomerDTO>(SAP_ENDPOINTS.customerByEmail(email)),
};

export const SapOrdersService = {
  create: (order: SapOrderDTO) =>
    sapFetch<SapOrderDTO>(SAP_ENDPOINTS.orders, { method: "POST", body: order }),
  get: (id: string) => sapFetch<SapOrderDTO>(SAP_ENDPOINTS.orderById(id)),
};

export const SapStoresService = {
  list: () => sapFetch<SapStoreDTO[]>(SAP_ENDPOINTS.stores),
};
