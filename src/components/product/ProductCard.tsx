import { Link } from "@tanstack/react-router";
import { GitCompare, Heart, MapPin, ShoppingCart, Star, Truck } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";

function Badges({ labels }: { labels?: Product["labels"] }) {
  if (!labels?.length) return null;
  const map: Record<string, { text: string; cls: string }> = {
    new: { text: "Nuevo", cls: "bg-secondary text-secondary-foreground" },
    sale: { text: "Oferta", cls: "bg-primary text-primary-foreground" },
    bestseller: { text: "Más vendido", cls: "bg-success text-success-foreground" },
    "low-stock": { text: "Últimas unidades", cls: "bg-warning text-warning-foreground" },
  };
  return (
    <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
      {labels.map((l) => (
        <span key={l} className={`rounded px-2 py-0.5 text-[10px] font-black shadow-sm ${map[l].cls}`}>
          {map[l].text}
        </span>
      ))}
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const lowStock = product.stock <= 8;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    add(product, 1);
    toast.success("Agregado al carrito", { description: product.name });
  };

  return (
    <Link
      to="/p/$slug"
      params={{ slug: product.slug }}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        <Badges labels={product.labels} />
        {discount > 0 && (
          <span className="absolute right-2 top-2 z-10 rounded bg-destructive px-2 py-1 text-xs font-black text-destructive-foreground shadow-sm">
            -{discount}%
          </span>
        )}
        <div className="absolute right-2 top-11 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full">
            <Heart className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full">
            <GitCompare className="h-4 w-4" />
          </Button>
        </div>
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs font-black uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="font-bold text-foreground">{product.rating}</span>
          </div>
        </div>
        <h3 className="min-h-[2.75rem] text-sm font-bold leading-snug line-clamp-2">{product.name}</h3>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-muted-foreground">
            <Truck className="h-3 w-3" /> 24-72h
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-muted-foreground">
            <MapPin className="h-3 w-3" /> Retiro hoy
          </span>
        </div>
        <div className={`text-xs font-bold ${lowStock ? "text-warning" : "text-success"}`}>
          {lowStock ? `${product.stock} unidades disponibles` : "Stock confirmado por tienda"}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            {product.originalPrice && (
              <div className="text-xs text-muted-foreground line-through">
                {formatPrice(product.originalPrice)}
              </div>
            )}
            <div className="text-xl font-black text-foreground">{formatPrice(product.price)}</div>
            <div className="text-[11px] font-semibold text-muted-foreground">Cuotas desde Q{Math.ceil(product.price / 10)}</div>
          </div>
          <Button
            size="icon"
            onClick={handleAdd}
            className="h-10 w-10 shrink-0 bg-primary hover:bg-primary-hover"
            aria-label="Agregar al carrito"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Link>
  );
}
