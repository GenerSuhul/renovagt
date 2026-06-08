export type Category = {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  image?: string;
};

export type Brand = {
  id: string;
  name: string;
};

export type Product = {
  id: string;
  sku: string;
  sapItemCode?: string;
  slug: string;
  name: string;
  shortDescription?: string;
  brand: string;
  brandId?: string;
  categorySlug: string;
  categoryId?: string;
  categoryName?: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  image: string;
  images?: string[];
  description: string;
  specs?: { label: string; value: string }[];
  stock: number;
  storeStock?: { storeId: string; qty: number }[];
  labels?: ("new" | "sale" | "bestseller" | "low-stock")[];
  ecommerceStatus?: "draft" | "needs_enrichment" | "enriched" | "published" | "archived" | string;
  enrichmentStatus?: "needs_enrichment" | "in_review" | "complete" | string;
  enrichmentRequired?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Store = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  hours: string;
};

export type PromotionalBanner = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  desktopImage: string;
  mobileImage: string;
  targetUrl?: string;
  placement: string;
  sortOrder: number;
  textAlign?: string;
  textTheme?: string;
};

export type ShippingMethod = {
  id: string;
  code: string;
  name: string;
  type: string;
  basePrice: number;
  freeFrom?: number;
  estimatedDays?: string;
};

export type PaymentGateway = {
  id: string;
  code: string;
  name: string;
  provider: string;
  environment: string;
  status: string;
  currency: string;
  supportsInstallments: boolean;
  webhookUrl?: string;
};

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  price: number;
  image: string;
  qty: number;
};
