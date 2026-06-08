import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FALLBACK_PRODUCT_IMAGE } from "@/lib/catalog";
import type { CartLine, Product } from "@/lib/types";

const STORAGE_KEY = "renova_cart_v2_middleware_cutover";

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: Product, qty?: number) => void;
  update: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const asCartLine = (value: unknown): CartLine | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const productId = typeof record.productId === "string" ? record.productId : "";
  const sku = typeof record.sku === "string" ? record.sku : "";
  const name = typeof record.name === "string" ? record.name : "";
  const price = typeof record.price === "number" ? record.price : Number(record.price || 0);
  const qty = typeof record.qty === "number" ? record.qty : Number(record.qty || 0);
  if (!productId || !name || qty <= 0) return null;
  const image = typeof record.image === "string" && record.image.trim() ? record.image : FALLBACK_PRODUCT_IMAGE;
  return { productId, sku, name, price, image, qty };
};

const sanitizeLines = (value: unknown): CartLine[] =>
  Array.isArray(value) ? value.map(asCartLine).filter((line): line is CartLine => Boolean(line)) : [];

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setLines(sanitizeLines(JSON.parse(raw)));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((product: Product, qty = 1) => {
    setLines((prev) => {
      if (product.stock <= 0 || qty <= 0) return prev;
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, qty: Math.max(1, Math.min(l.qty + qty, product.stock)) } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          image: product.image || FALLBACK_PRODUCT_IMAGE,
          qty: Math.max(1, Math.min(qty, product.stock)),
        },
      ];
    });
  }, []);

  const update = useCallback((productId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, qty } : l)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((a, l) => a + l.qty, 0);
    const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
    return { lines, count, subtotal, add, update, remove, clear };
  }, [lines, add, update, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
