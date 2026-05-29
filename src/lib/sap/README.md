# RENOVA ↔ SAP Business One HANA — Integration Layer

This folder is the **abstraction boundary** between the RENOVA storefront
and the SAP middleware. The middleware is a separate service that talks
directly to SAP B1 HANA Service Layer; this app only consumes its REST API.

## Files

- `config.ts` — endpoint paths, sync job cron schedules, runtime config loader.
- `client.ts` — thin `fetch`-based HTTP client with retry, timeout and typed errors.
- `dtos.ts` — TypeScript shapes mirroring the SAP/middleware payloads.
- `services.ts` — domain facades (`SapProductsService`, `SapOrdersService`, …).

## Environment variables (server-only)

```
SAP_MIDDLEWARE_URL=https://sap-middleware.renova.internal
SAP_MIDDLEWARE_API_KEY=...
SAP_COMPANY_DB=SBO_RENOVA_PROD
```

## Synchronization scope

| Entity      | Direction         | Notes                                    |
| ----------- | ----------------- | ---------------------------------------- |
| Products    | SAP → RENOVA      | Master data + descriptions               |
| Inventory   | SAP → RENOVA      | Per warehouse / store                    |
| Prices      | SAP → RENOVA      | Price lists, customer-specific pricing   |
| Customers   | Bidirectional     | Web signup → BP create; profile updates  |
| Orders      | RENOVA → SAP      | Web order → Sales Order (Doc Entry)      |
| Stores      | SAP → RENOVA      | Warehouse master                         |
| Promotions  | SAP → RENOVA      | Discount groups                          |
| Categories  | SAP → RENOVA      | ItemsGroup mapping                       |
| Shipping    | SAP → RENOVA      | Delivery status polling / webhook        |

## Usage (server-side only)

```ts
import { createServerFn } from "@tanstack/react-start";
import { SapProductsService } from "@/lib/sap/services";

export const syncProducts = createServerFn({ method: "POST" }).handler(async () => {
  const products = await SapProductsService.list({ pageSize: 500 });
  // map → upsert into local DB
  return { count: products.length };
});
```

**Never import anything from `@/lib/sap/*` in client components.** The
API key is a server secret.
