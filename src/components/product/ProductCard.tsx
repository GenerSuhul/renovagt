import { Link } from "@tanstack/react-router";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_PRODUCT_IMAGE } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";

function Badges({ labels }: { labels?: Product["labels"] }) {
  if (!labels?.length) return null;
  const map: Record<string, { text: string; cls: string }> = {
    new: { text: "Nuevo", cls: "bg-secondary text-secondary-foreground" },
    sale: { text: "Oferta", cls: "bg-primary text-primary-foreground" },
    bestseller: { text: "Mas vendido", cls: "bg-success text-success-foreground" },
    "low-stock": { text: "Ultimas unidades", cls: "bg-warning text-warning-foreground" },
  };

  return (
    <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
      {labels.map((label, index) => {
        const badge = map[label] ?? { text: label, cls: "bg-surface text-foreground" };
        return (
          <span key={`${label}-${index}`} className={`rounded px-2 py-0.5 text-[10px] font-black shadow-sm ${badge.cls}`}>
            {badge.text}
          </span>
        );
      })}
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const { user } = useAuth();
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const lowStock = product.stock <= 8;
  const outOfStock = product.stock <= 0;

  const handleAdd = () => {
    if (outOfStock) {
      toast.error("Producto sin disponibilidad", { description: product.name });
      return;
    }
    add(product, 1);
    toast.success("Agregado al carrito", { description: product.name });
  };

  const handleWishlist = async () => {
    if (!user) {
      toast.error("Inicia sesion para guardar favoritos");
      return;
    }

    const { error } = await supabase.from("wishlist_items").upsert(
      {
        user_id: user.id,
        product_id: product.id,
        product_name: product.name,
        product_image: product.image,
        product_price: product.price,
      },
      { onConflict: "user_id,product_id" },
    );

    if (error) {
      toast.error("No se pudo guardar en favoritos", { description: error.message });
      return;
    }

    toast.success("Guardado en tu lista de deseos", { description: product.name });
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-card-hover)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        <Badges labels={product.labels} />
        {discount > 0 && (
          <span className="absolute right-2 top-2 z-10 rounded bg-destructive px-2 py-1 text-xs font-black text-destructive-foreground shadow-sm">
            -{discount}%
          </span>
        )}
        <div className="absolute right-2 top-11 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full"
            aria-label="Guardar en lista de deseos"
            onClick={handleWishlist}
          >
            <Heart className="h-4 w-4" />
          </Button>
        </div>
        <Link to="/p/$slug" params={{ slug: product.slug }} aria-label={product.name} className="block h-full w-full">
          <img
            src={product.image || FALLBACK_PRODUCT_IMAGE}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
          />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs font-black uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="font-bold text-foreground">{product.rating}</span>
          </div>
        </div>
        <Link to="/p/$slug" params={{ slug: product.slug }} className="hover:text-primary">
          <h3 className="line-clamp-2 min-h-[2.45rem] text-[13px] font-bold leading-snug">{product.name}</h3>
        </Link>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex rounded-full bg-surface px-2 py-1">
            SKU {product.sku}
          </span>
          {product.categorySlug && (
            <span className="inline-flex rounded-full bg-surface px-2 py-1 capitalize">
              {product.categorySlug.replace(/-/g, " ")}
            </span>
          )}
        </div>
        <div className={`text-xs font-bold ${outOfStock ? "text-destructive" : lowStock ? "text-warning" : "text-success"}`}>
          {outOfStock ? "Sin disponibilidad" : lowStock ? `${product.stock} unidades disponibles` : "Stock confirmado por tienda"}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            {product.originalPrice && (
              <div className="text-xs text-muted-foreground line-through">
                {formatPrice(product.originalPrice)}
              </div>
            )}
            <div className="text-lg font-black text-foreground">{formatPrice(product.price)}</div>
          </div>
          <Button
            onClick={handleAdd}
            disabled={outOfStock}
            className="h-10 shrink-0 gap-2 rounded-md bg-primary px-3 text-xs font-black hover:bg-primary-hover"
            aria-label="Agregar al carrito"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden xl:inline">Agregar</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
