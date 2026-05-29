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
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
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
};

export type Store = {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  hours: string;
};

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  price: number;
  image: string;
  qty: number;
};
