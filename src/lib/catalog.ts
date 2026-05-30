import { supabase } from "@/integrations/supabase/client";
import type { Brand, Category, Product, PromotionalBanner, ShippingMethod, Store } from "./types";

type DbRecord = Record<string, unknown>;
type Query = {
  select: (columns?: string) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, value: unknown[]) => Query;
  order: (column: string, options?: { ascending?: boolean }) => Query;
  limit: (count: number) => Query;
  single: () => Promise<{ data: DbRecord | null; error: Error | null }>;
  then: Promise<{ data: DbRecord[] | null; error: Error | null }>["then"];
};

const from = (table: string) =>
  (supabase as unknown as { from: (table: string) => Query }).from(table);

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" ? value : fallback);
const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

function unwrap<T>(data: T | null, error: Error | null): T {
  if (error) throw error;
  if (!data) throw new Error("No data returned from Supabase");
  return data;
}

function emptyOnError<T>(error: Error | null, value: T): T {
  if (error) {
    console.error("[Catalog] Supabase catalog query failed", error.message);
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
  return {
    id: asString(row.id),
    title: asString(row.title),
    subtitle: asString(row.subtitle),
    image: asString(row.image_url),
    targetUrl: asString(row.target_url),
    placement: asString(row.placement),
    sortOrder: asNumber(row.sort_order),
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

function mapProduct(row: DbRecord): Product {
  const brand = row.brands as DbRecord | null;
  const category = row.categories as DbRecord | null;
  const inventory = asArray(row.inventory);
  const stock = inventory.reduce((sum, item) => sum + asNumber((item as DbRecord).qty), 0);

  return {
    id: asString(row.id),
    sku: asString(row.sku),
    slug: asString(row.slug),
    name: asString(row.name),
    brand: asString(brand?.name),
    categorySlug: asString(category?.slug),
    price: asNumber(row.price),
    originalPrice: row.original_price === null ? undefined : asNumber(row.original_price),
    rating: asNumber(row.rating),
    reviews: asNumber(row.reviews),
    image: asString(row.image),
    images: asArray(row.images).map((image) => asString(image)).filter(Boolean),
    description: asString(row.description),
    specs: asArray(row.specs) as Product["specs"],
    stock,
    labels: asArray(row.labels) as Product["labels"],
  };
}

const productSelect =
  "id, sku, slug, name, price, original_price, rating, reviews, image, images, description, specs, labels, brands(name), categories(slug), inventory(qty)";

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await from("categories")
    .select("id, slug, name, icon, image")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapCategory);
}

export async function getBrands(): Promise<Brand[]> {
  const { data, error } = await from("brands").select("id, name").order("name", { ascending: true });
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapBrand);
}

export async function getStores(): Promise<Store[]> {
  const { data, error } = await from("stores")
    .select("id, name, city, address, phone, hours")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapStore);
}

export async function getPromotionalBanners(placement?: string): Promise<PromotionalBanner[]> {
  let query = from("promotional_banners")
    .select("id, title, subtitle, image_url, target_url, placement, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (placement) query = query.eq("placement", placement);
  const { data, error } = await query;
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapBanner);
}

export async function getShippingMethods(): Promise<ShippingMethod[]> {
  const { data, error } = await from("shipping_methods")
    .select("id, code, name, type, base_price, free_from, estimated_days")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapShippingMethod);
}

export async function getProducts(limit?: number): Promise<Product[]> {
  let query = from("products")
    .select(productSelect)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const { data, error } = await from("products")
    .select(productSelect)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error) return undefined;
  return data ? mapProduct(data) : undefined;
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const { data, error } = await from("categories")
    .select("id, slug, name, icon, image")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (error) return undefined;
  return data ? mapCategory(data) : undefined;
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  const category = await getCategoryBySlug(slug);
  if (!category) return [];
  const { data, error } = await from("products")
    .select(productSelect)
    .eq("category_id", category.id)
    .eq("is_active", true);
  if (error) return emptyOnError(error, []);
  return unwrap(data, error).map(mapProduct);
}

export async function getRelatedProducts(product: Product): Promise<Product[]> {
  const products = await getProductsByCategory(product.categorySlug);
  return products.filter((item) => item.id !== product.id).slice(0, 4);
}
