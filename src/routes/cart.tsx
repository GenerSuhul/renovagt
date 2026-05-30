import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { formatPrice } from "@/lib/format";
import { getShippingMethods } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Carrito — RENOVA" }] }),
  loader: async () => ({ shippingMethods: await getShippingMethods() }),
  component: CartPage,
});

function CartPage() {
  const { shippingMethods } = Route.useLoaderData();
  const { lines, update, remove, subtotal, count } = useCart();
  const deliveryMethod = shippingMethods.find((method) => method.type === "delivery") ?? shippingMethods[0];
  const shipping =
    !deliveryMethod || subtotal === 0 || (deliveryMethod.freeFrom !== undefined && subtotal >= deliveryMethod.freeFrom)
      ? 0
      : deliveryMethod.basePrice;
  const tax = subtotal * 0.12;
  const total = subtotal + shipping + tax;

  if (lines.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center max-w-md">
        <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-black">Tu carrito está vacío</h1>
        <p className="text-muted-foreground mt-2">Empieza a explorar nuestro catálogo y agrega tus productos favoritos.</p>
        <Link to="/" className="inline-block mt-6">
          <Button className="bg-primary hover:bg-primary-hover">Explorar productos</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-black mb-6">Mi carrito ({count} {count === 1 ? "producto" : "productos"})</h1>
      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.productId} className="bg-card border border-border rounded-xl p-4 flex gap-4">
              <img src={l.image} alt={l.name} className="h-24 w-24 object-cover rounded-lg bg-surface" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">SKU: {l.sku}</div>
                <h3 className="font-semibold leading-snug mt-0.5">{l.name}</h3>
                <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center border border-border rounded-md">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update(l.productId, l.qty - 1)}><Minus className="h-3.5 w-3.5" /></Button>
                    <div className="w-10 text-center text-sm font-semibold">{l.qty}</div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update(l.productId, l.qty + 1)}><Plus className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="font-bold text-lg">{formatPrice(l.price * l.qty)}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(l.productId)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <aside className="bg-card border border-border rounded-xl p-6 h-fit sticky top-32">
          <h2 className="font-bold text-lg mb-4">Resumen</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Envío</span><span>{shipping === 0 ? <span className="text-success font-semibold">Gratis</span> : formatPrice(shipping)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IVA (12%)</span><span>{formatPrice(tax)}</span></div>
          </div>
          <div className="my-4 h-px bg-border" />
          <div className="flex justify-between items-end">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-black">{formatPrice(total)}</span>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Cupón de descuento" className="h-10" />
              <Button variant="outline" className="h-10">Aplicar</Button>
            </div>
            <Link to="/checkout" className="block">
              <Button className="w-full bg-primary hover:bg-primary-hover h-12 text-base font-semibold">
                Continuar al pago <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Link to="/" className="block">
              <Button variant="ghost" className="w-full">Seguir comprando</Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
