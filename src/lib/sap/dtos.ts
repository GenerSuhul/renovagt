/**
 * Data Transfer Objects matching the shape exposed by the SAP middleware.
 * These are intentionally framework-agnostic and serializable.
 */

export interface SapProductDTO {
  ItemCode: string;
  ItemName: string;
  ItemsGroupCode: number;
  Brand?: string;
  SalesUnit?: string;
  Price?: number;
  Currency?: string;
  OnHand?: number;
  Description?: string;
  Properties?: Record<string, string>;
}

export interface SapInventoryDTO {
  ItemCode: string;
  WarehouseCode: string;
  OnHand: number;
  Committed: number;
  Available: number;
}

export interface SapCustomerDTO {
  CardCode: string;
  CardName: string;
  EmailAddress: string;
  Phone1?: string;
  BillToStreet?: string;
  BillToCity?: string;
  BillToCountry?: string;
}

export interface SapOrderLineDTO {
  ItemCode: string;
  Quantity: number;
  UnitPrice: number;
  WarehouseCode?: string;
}

export interface SapOrderDTO {
  DocEntry?: number;
  CardCode: string;
  DocDate: string;
  Comments?: string;
  DocumentLines: SapOrderLineDTO[];
  Address?: string;
  ShipToCode?: string;
  PaymentMethod?: string;
}

export interface SapStoreDTO {
  WarehouseCode: string;
  WarehouseName: string;
  Street?: string;
  City?: string;
  Phone?: string;
}

export interface SapApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface SapSyncResult<T> {
  ok: boolean;
  syncedAt: string;
  data?: T;
  error?: SapApiError;
}
