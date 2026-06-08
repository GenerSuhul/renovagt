/**
 * High-level service facades over the SAP middleware HTTP client.
 * Each function maps a RENOVA domain operation to an endpoint defined
 * in `./config.ts`, keeping SAP contracts out of UI routes.
 */

import { SAP_ENDPOINTS } from "./config";
import { sapFetch } from "./client";
import type {
  SapCustomerDTO,
  SapCategoryDTO,
  SapCreditNoteDTO,
  SapInvoiceDTO,
  SapInventoryDTO,
  SapOrderDTO,
  SapPriceDTO,
  SapProductDTO,
  SapPromotionDTO,
  SapShipmentDTO,
  SapStoreDTO,
} from "./dtos";

export const SapProductsService = {
  list: (q?: { search?: string; page?: number; pageSize?: number }) =>
    sapFetch<SapProductDTO[]>(SAP_ENDPOINTS.products, { query: q }),
  bySku: (sku: string) => sapFetch<SapProductDTO>(SAP_ENDPOINTS.productBySku(sku)),
};

export const SapCategoriesService = {
  list: () => sapFetch<SapCategoryDTO[]>(SAP_ENDPOINTS.categories),
};

export const SapPricesService = {
  list: (q?: { sku?: string; priceList?: string; page?: number; pageSize?: number }) =>
    sapFetch<SapPriceDTO[]>(SAP_ENDPOINTS.prices, { query: q }),
  bySku: (sku: string) => sapFetch<SapPriceDTO[]>(SAP_ENDPOINTS.pricesBySku(sku)),
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

export const SapInvoicesService = {
  createForOrder: (orderId: string) =>
    sapFetch<SapInvoiceDTO>(SAP_ENDPOINTS.invoiceForOrder(orderId), { method: "POST" }),
  byOrder: (orderId: string) => sapFetch<SapInvoiceDTO>(SAP_ENDPOINTS.invoiceByOrder(orderId)),
};

export const SapCreditNotesService = {
  upsert: (creditNote: SapCreditNoteDTO) =>
    sapFetch<SapCreditNoteDTO>(SAP_ENDPOINTS.creditNotes, { method: "POST", body: creditNote }),
};

export const SapShipmentsService = {
  upsertTracking: (shipment: SapShipmentDTO) =>
    sapFetch<SapShipmentDTO>(SAP_ENDPOINTS.shipments, { method: "POST", body: shipment }),
  byOrder: (orderId: string) => sapFetch<SapShipmentDTO[]>(SAP_ENDPOINTS.shipmentsByOrder(orderId)),
};

export const SapStoresService = {
  list: () => sapFetch<SapStoreDTO[]>(SAP_ENDPOINTS.stores),
};

export const SapPromotionsService = {
  list: () => sapFetch<SapPromotionDTO[]>(SAP_ENDPOINTS.promotions),
};
