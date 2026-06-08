import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, ShoppingCart, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_PRODUCT_IMAGE, getProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/button";

type WishlistRow = {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  product_price: number;
};

export const Route = createFileRoute("/account/wishlist")({
  head: () => ({ meta: [{ title: "Lista de deseos - RENOVA" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { user, loading } = useAuth();
  const { add } = useCart();
  const [items, setItems] = useState<WishlistRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("wishlist_items")
      .select("id, product_id, product_name, product_image, product_price")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data ?? []) as WishlistRow[]));
    getProducts(100).then(setProducts);
  }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("wishlist_items").delete().eq("id", id);
    if (error) {
      toast.error("No se pudo quitar favorito", { description: error.message });
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  };

  if (loading) {
    return (
      <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center font-black">Cargando favoritos...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <Heart className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-2xl font-black">Inicia sesion para ver favoritos</h1>
          <Link to="/login" className="mt-5 inline-block">
            <Button className="bg-primary font-bold hover:bg-primary-hover">Iniciar sesion</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Cuenta RENOVA</div>
          <h1 className="mt-2 text-3xl font-black">Lista de deseos</h1>
        </div>
        <Link to="/">
          <Button variant="outline">Explorar catalogo</Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 font-black">Aun no guardas favoritos</h2>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const product = productsById.get(item.product_id);
            return (
              <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <img
                  src={item.product_image || product?.image || FALLBACK_PRODUCT_IMAGE}
                  alt={item.product_name}
                  className="h-44 w-full bg-surface object-contain p-6"
                />
                <div className="p-4">
                  <h2 className="line-clamp-2 min-h-11 font-black">{item.product_name}</h2>
                  <div className="mt-2 text-xl font-black">{formatPrice(item.product_price)}</div>
                  <div className="mt-4 flex gap-2">
                    {product && (
                      <Button
                        className="flex-1 bg-primary font-bold hover:bg-primary-hover"
                        onClick={() => {
                          add(product, 1);
                          toast.success("Agregado al carrito", { description: product.name });
                        }}
                      >
                        <ShoppingCart className="mr-1 h-4 w-4" /> Comprar
                      </Button>
                    )}
                    <Button variant="outline" size="icon" onClick={() => remove(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
