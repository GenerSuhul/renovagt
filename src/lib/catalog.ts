import { supabase } from "@/integrations/supabase/client";
import type { Brand, Category, PaymentGateway, Product, PromotionalBanner, ShippingMethod, Store } from "./types";

type DbRecord = Record<string, unknown>;
export const FALLBACK_PRODUCT_IMAGE = "https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png";
export type CouponRule = {
  id: string;
  code: string;
  description?: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minOrderTotal?: number;
};
type Query = {
  select: (columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) => Query;
  eq: (column: string, value: unknown) => Query;
  or: (filters: string) => Query;
  in: (column: string, value: unknown[]) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
  range: (from: number, to: number) => Query;
  single: () => Promise<{ data: DbRecord | null; error: Error | null }>;
  then: Promise<{ data: DbRecord[] | null; error: Error | null }>["then"];
};
type QueryResult<T> = { data: T | null; error: Error | null; count?: number | null };

const from = (table: string) =>
  (supabase as unknown as { from: (table: string) => Query }).from(table);

const CATALOG_QUERY_TIMEOUT_MS = 5000;
const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
};
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);
const asRecordArray = (value: unknown) => (Array.isArray(value) ? (value as DbRecord[]) : []);
const imageUrlFromRecord = (record: DbRecord) => asString(record.image_url) || asString(record.url);

function unwrap<T>(data: T | null, error: Error | null): T {
  if (error) throw error;
  if (!data) throw new Error("No data returned from Supabase");
  return data;
}

async function resolveQuery<T>(query: PromiseLike<QueryResult<T>>, label: string): Promise<QueryResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<QueryResult<T>>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        data: null,
        error: new Error(`Supabase ${label} timeout after ${CATALOG_QUERY_TIMEOUT_MS}ms`),
      });
    }, CATALOG_QUERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(query), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function emptyOnError<T>(error: Error | null, value: T): T {
  if (error) {
    if (!error.message.includes("Could not find the table")) {
      console.warn("[Catalog] Supabase catalog query failed", error.message);
    }
    return value;
  }
  return value;
}

function mapCategory(row: DbRecord): Category {
  return {
    id: asString(row.id),
    slug: asString(row.slug),
    name: asString(row.name),
    icon: asString(row.icon),
    image: asString(row.image),
  };
}

function mapBrand(row: DbRecord): Brand {
  return {
    id: asString(row.id),
    name: asString(row.name),
  };
}

function mapStore(row: DbRecord): Store {
  return {
    id: asString(row.id),
    name: asString(row.name),
    city: asString(row.city),
    address: asString(row.address),
    phone: asString(row.phone),
    hours: asString(row.hours),
  };
}

function mapBanner(row: DbRecord): PromotionalBanner {
  const desktopImage = asString(row.desktop_image_url) || asString(row.image_url) || FALLBACK_PRODUCT_IMAGE;
  const mobileImage = asString(row.mobile_image_url) || desktopImage;
  return {
    id: asString(row.id),
    title: asString(row.title),
    subtitle: asString(row.subtitle),
    image: desktopImage,
    desktopImage,
    mobileImage,
    targetUrl: asString(row.target_url),
    placement: asString(row.placement),
    sortOrder: asNumber(row.sort_order),
    textAlign: asString(row.text_align, "left"),
    textTheme: asString(row.text_theme, "light"),
  };
}

function mapShippingMethod(row: DbRecord): ShippingMethod {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    type: asString(row.type),
    basePrice: asNumber(row.base_price),
    freeFrom: row.free_from === null ? undefined : asNumber(row.free_from),
    estimatedDays: asString(row.estimated_days),
  };
}

function mapPaymentGateway(row: DbRecord): PaymentGateway {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    provider: asString(row.provider),
    environment: asString(row.environment),
    status: asString(row.status),
    currency: asString(row.currency, "GTQ"),
    supportsInstallments: Boolean(row.supports_installments),
    webhookUrl: asString(row.webhook_url),
  };
}

function mapProduct(row: DbRecord): Product {
  const brand = row.brands as DbRecord | null;
  const category = row.categories as DbRecord | null;
  const inventory = asArray(row.inventory);
  const storeStock = inventory.map((item) => {
    const record = item as DbRecord;
    const fallbackAvailable =
      asNumber(record.on_hand, asNumber(record.qty)) -
      asNumber(record.committed) -
      asNumber(record.reserved_ecommerce) -
      asNumber(record.safety_stock);
    return {
      storeId: asString(record.store_id),
      qty: Math.max(0, asNumber(record.available_ecommerce, fallbackAvailable)),
    };
  });
  const stock = storeStock.reduce((sum, item) => sum + item.qty, 0);
  const storedImages = asArray(row.images)
    .map((image) => (typeof image === "string" ? image : imageUrlFromRecord(image as DbRecord)))
    .filter(Boolean);
  const galleryImages = asRecordArray(row.product_images)
    .map((image) => ({
      url: imageUrlFromRecord(image),
      sortOrder: asNumber(image.sort_order),
      isPrimary: image.is_primary === true,
    }))
    .filter((image) => image.url)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
    .map((image) => image.url);
  const images = Array.from(new Set([...galleryImages, ...storedImages]));
  const primaryImage = galleryImages[0] || asString(row.image) || images[0] || FALLBACK_PRODUCT_IMAGE;

  return {
    id: asString(row.id),
    sku: asString(row.sku),
    sapItemCode: asString(row.sap_item_code) || asString(row.item_code) || asString(row.sku),
    slug: asString(row.slug),
    name: asString(row.name),
    shortDescription: asString(row.short_description),
    brand: asString(brand?.name),
    brandId: asString(row.brand_id) || asString(brand?.id),
    categorySlug: asString(category?.slug),
    categoryId: asString(row.category_id) || asString(category?.id),
    categoryName: asString(category?.name),
    price: asNumber(row.price),
    originalPrice: row.original_price === null ? undefined : asNumber(row.original_price),
    rating: asNumber(row.rating),
    reviews: asNumber(row.reviews),
    image: primaryImage,
    images,
    description: asString(row.description),
    specs: asArray(row.specs) as Product["specs"],
    stock,
    storeStock,
    labels: asArray(row.labels) as Product["labels"],
    ecommerceStatus: asString(row.ecommerce_status, "draft"),
    enrichmentStatus: asString(row.enrichment_status, "needs_enrichment"),
    enrichmentRequired: Boolean(row.enrichment_required),
    isActive: row.is_active !== false,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapCouponRule(row: DbRecord): CouponRule {
  return {
    id: asString(row.id),
    code: asString(row.code),
    description: asString(row.description),
    discountType: asString(row.discount_type, "percent") === "fixed" ? "fixed" : "percent",
    discountValue: asNumber(row.discount_value),
    minOrderTotal: row.min_order_total === null ? undefined : asNumber(row.min_order_total),
  };
}

const productSelect =
  "id, sku, sap_item_code, item_code, slug, name, short_description, price, original_price, rating, reviews, image, images, description, specs, labels, brand_id, category_id, ecommerce_status, enrichment_status, enrichment_required, is_active, created_at, updated_at, brands(id,name), categories(id,slug,name), inventory(store_id, qty, on_hand, committed, reserved_ecommerce, safety_stock, available_ecommerce), product_images(id,url,image_url,sort_order,is_primary)";
const adminProductPageSelect =
  "id, sku, sap_item_code, item_code, slug, name, short_description, price, original_price, image, images, description, brand_id, category_id, ecommerce_status, enrichment_status, enrichment_required, is_active, created_at, updated_at, brands(id,name), categories(id,slug,name), inventory(store_id, qty, on_hand, committed, reserved_ecommerce, safety_stock, available_ecommerce), product_images(id,url,image_url,sort_order,is_primary)";
const adminProductOptionSelect =
  "id, sku, sap_item_code, item_code, slug, name, price, image, images, brand_id, category_id, ecommerce_status, enrichment_status, enrichment_required, is_active, created_at, updated_at";

export type AdminProductStatus = "all" | "needs_enrichment" | "enriched" | "published" | "draft" | "archived";

export type AdminProductPage = {
  products: Product[];
  total: number;
  counts: Record<AdminProductStatus, number>;
};

function sanitizePostgrestSearch(value: string) {
  return value
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function applyAdminProductFilters(query: Query, status: AdminProductStatus, search: string) {
  let nextQuery = query;
  if (status !== "all") nextQuery = nextQuery.eq("ecommerce_status", status);

  const normalizedSearch = sanitizePostgrestSearch(search);
  if (normalizedSearch) {
    const pattern = `%${normalizedSearch}%`;
    nextQuery = nextQuery.or(
      `sku.ilike.${pattern},item_code.ilike.${pattern},sap_item_code.ilike.${pattern},name.ilike.${pattern}`,
    );
  }

  return nextQuery;
}

async function countAdminProductsByStatus(): Promise<Record<AdminProductStatus, number>> {
  const statuses: AdminProductStatus[] = ["needs_enrichment", "enriched", "published", "draft", "archived"];
  const entries = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await resolveQuery<DbRecord[]>(
        from("products").select("id", { count: "exact", head: true }).eq("ecommerce_status", status),
        `admin_products_count_${status}`,
      );
      return [status, error ? 0 : count ?? 0] as const;
    }),
  );
  const counts = Object.fromEntries(entries) as Record<AdminProductStatus, number>;
  counts.all = entries.reduce((sum, [, value]) => sum + value, 0);
  return counts;
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("categories")
      .select("id, slug, name, icon, image")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    "categories",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapCategory);
}

export async function getBrands(): Promise<Brand[]> {
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("brands").select("id, name").order("name", { ascending: true }),
    "brands",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapBrand);
}

export async function getStores(): Promise<Store[]> {
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("stores")
      .select("id, name, city, address, phone, hours")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    "stores",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapStore);
}

export async function getPromotionalBanners(placement?: string): Promise<PromotionalBanner[]> {
  let query = from("promotional_banners")
    .select("id, title, subtitle, image_url, desktop_image_url, mobile_image_url, target_url, placement, sort_order, text_align, text_theme")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (placement) query = query.eq("placement", placement);
  const { data, error } = await resolveQuery<DbRecord[]>(query, "promotional_banners");
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapBanner);
}

export async function getShippingMethods(): Promise<ShippingMethod[]> {
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("shipping_methods")
      .select("id, code, name, type, base_price, free_from, estimated_days")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("base_price", { ascending: true }),
    "shipping_methods",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapShippingMethod);
}

export async function getPaymentGateways(): Promise<PaymentGateway[]> {
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("ecommerce_payment_gateways")
      .select("id, code, name, provider, environment, status, currency, supports_installments, webhook_url")
      .eq("status", "active")
      .order("name", { ascending: true }),
    "ecommerce_payment_gateways",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapPaymentGateway);
}

export async function getProducts(limit?: number): Promise<Product[]> {
  let query = from("products")
    .select(productSelect)
    .eq("is_active", true)
    .eq("ecommerce_status", "published")
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await resolveQuery<DbRecord[]>(query, "products");
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapProduct);
}

export async function getAdminProducts(limit = 6000): Promise<Product[]> {
  const pageSize = 1000;
  const products: Product[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await resolveQuery<DbRecord[]>(
      from("products")
        .select(productSelect)
        .order("created_at", { ascending: false })
        .range(offset, to),
      "admin_products",
    );
    if (error) return products.length > 0 ? products : emptyOnError(error, []);
    const rows = unwrap(data, error);
    products.push(...rows.map(mapProduct));
    if (rows.length < pageSize) break;
  }

  return products;
}

export async function getAdminProductPage({
  page = 0,
  pageSize = 50,
  status = "all",
  search = "",
}: {
  page?: number;
  pageSize?: number;
  status?: AdminProductStatus;
  search?: string;
}): Promise<AdminProductPage> {
  const safePageSize = Math.min(Math.max(pageSize, 20), 100);
  const fromRow = Math.max(0, page) * safePageSize;
  const toRow = fromRow + safePageSize - 1;
  const baseQuery = from("products")
    .select(adminProductPageSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(fromRow, toRow);
  const { data, error, count } = await resolveQuery<DbRecord[]>(
    applyAdminProductFilters(baseQuery, status, search),
    "admin_products_page",
  );
  const counts = await countAdminProductsByStatus();
  if (error) return emptyOnError(error, { products: [], total: 0, counts });
  return {
    products: unwrap(data, error).map(mapProduct),
    total: count ?? 0,
    counts,
  };
}

export async function getAdminProductOptions(limit = 6000): Promise<Product[]> {
  const pageSize = 1000;
  const products: Product[] = [];

  for (let offset = 0; offset < limit; offset += pageSize) {
    const to = Math.min(offset + pageSize - 1, limit - 1);
    const { data, error } = await resolveQuery<DbRecord[]>(
      from("products")
        .select(adminProductOptionSelect)
        .order("name", { ascending: true })
        .range(offset, to),
      "admin_product_options",
    );
    if (error) return products.length > 0 ? products : emptyOnError(error, []);
    const rows = unwrap(data, error);
    products.push(...rows.map(mapProduct));
    if (rows.length < pageSize) break;
  }

  return products;
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const { data, error } = await resolveQuery<DbRecord>(
    from("products")
      .select(productSelect)
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("ecommerce_status", "published")
      .single(),
    "product_by_slug",
  );
  if (error) return undefined;
  return data ? mapProduct(data) : undefined;
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const { data, error } = await resolveQuery<DbRecord>(
    from("categories")
      .select("id, slug, name, icon, image")
      .eq("slug", slug)
      .eq("is_active", true)
      .single(),
    "category_by_slug",
  );
  if (error) return undefined;
  return data ? mapCategory(data) : undefined;
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  const category = await getCategoryBySlug(slug);
  if (!category) return [];
  const { data, error } = await resolveQuery<DbRecord[]>(
    from("products")
      .select(productSelect)
      .eq("category_id", category.id)
      .eq("is_active", true)
      .eq("ecommerce_status", "published"),
    "products_by_category",
  );
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapProduct);
}

export async function getRelatedProducts(product: Product): Promise<Product[]> {
  const products = await getProductsByCategory(product.categorySlug);
  return products.filter((item) => item.id !== product.id).slice(0, 4);
}

export async function getCouponByCode(code: string): Promise<CouponRule | undefined> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return undefined;
  const { data, error } = await resolveQuery<DbRecord>(
    from("coupon_rules")
      .select("id, code, description, discount_type, discount_value, min_order_total")
      .eq("code", normalized)
      .eq("is_active", true)
      .single(),
    "coupon_by_code",
  );
  if (error) return undefined;
  return data ? mapCouponRule(data) : undefined;
}
