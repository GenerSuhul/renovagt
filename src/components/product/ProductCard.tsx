import { Link } from "@tanstack/react-router";
import { Star, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

function Badges({ labels }: { labels?: Product["labels"] }) {
  if (!labels?.length) return null;
  const map: Record<string, { text: string; cls: string }> = {
    new: { text: "Nuevo", cls: "bg-secondary text-secondary-foreground" },
    sale: { text: "Oferta", cls: "bg-primary text-primary-foreground" },
    bestseller: { text: "Más vendido", cls: "bg-success text-success-foreground" },
    "low-stock": { text: "Últimas unidades", cls: "bg-warning text-warning-foreground" },
  };
  return (
    <div className="absolute top-2 left-2 flex flex-col gap-1">
      {labels.map((l) => (
        <span key={l} className={`text-[10px] font-bold px-2 py-0.5 rounded ${map[l].cls}`}>
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
      className="group bg-card border border-border rounded-xl overflow-hidden hover:shadow-[var(--shadow-card-hover)] transition-all relative flex flex-col"
    >
      <div className="relative aspect-square bg-surface overflow-hidden">
        <Badges labels={product.labels} />
        {discount > 0 && (
          <span className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded">
            -{discount}%
          </span>
        )}
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{product.brand}</div>
        <h3 className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 fill-warning text-warning" />
          <span className="font-medium text-foreground">{product.rating}</span>
          <span>({product.reviews})</span>
        </div>
        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div>
            {product.originalPrice && (
              <div className="text-xs text-muted-foreground line-through">
                {formatPrice(product.originalPrice)}
              </div>
            )}
            <div className="text-lg font-bold text-foreground">{formatPrice(product.price)}</div>
          </div>
          <Button
            size="icon"
            onClick={handleAdd}
            className="bg-primary hover:bg-primary-hover h-9 w-9 shrink-0"
            aria-label="Agregar al carrito"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Link>
  );
}
