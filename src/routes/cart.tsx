import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { formatPrice } from "@/lib/format";
import { FALLBACK_PRODUCT_IMAGE, getCouponByCode, getShippingMethods, type CouponRule } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Carrito - RENOVA" }] }),
  loader: async () => ({ shippingMethods: await getShippingMethods() }),
  component: CartPage,
});

function CartPage() {
  const { shippingMethods } = Route.useLoaderData();
  const { lines, update, remove, subtotal, count } = useCart();
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponRule | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const methods = shippingMethods as import("@/lib/types").ShippingMethod[];
  const deliveryMethod = methods.find((method) => method.type === "delivery") ?? methods[0];
  const shipping =
    !deliveryMethod || subtotal === 0 || (deliveryMethod.freeFrom !== undefined && subtotal >= deliveryMethod.freeFrom)
      ? 0
      : deliveryMethod.basePrice;

  const discount = coupon
    ? coupon.discountType === "percent"
      ? subtotal * (coupon.discountValue / 100)
      : coupon.discountValue
    : 0;
  const tax = Math.max(subtotal - discount, 0) * 0.12;
  const total = Math.max(subtotal - discount, 0) + shipping + tax;

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) {
      toast.error("Ingresa un codigo de cupon");
      return;
    }
    setCheckingCoupon(true);
    try {
      const found = await getCouponByCode(code);
      if (!found) {
        setCoupon(null);
        toast.error("Cupon no disponible");
        return;
      }
      if (found.minOrderTotal && subtotal < found.minOrderTotal) {
        setCoupon(null);
        toast.error("Compra minima no alcanzada", {
          description: `Este cupon aplica desde ${formatPrice(found.minOrderTotal)}.`,
        });
        return;
      }
      setCoupon(found);
      toast.success("Cupon aplicado", { description: found.description || found.code });
    } finally {
      setCheckingCoupon(false);
    }
  };

  if (lines.length === 0) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-black">Tu carrito esta vacio</h1>
        <p className="mt-2 text-muted-foreground">
          Empieza a explorar nuestro catalogo y agrega tus productos favoritos.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button className="bg-primary hover:bg-primary-hover">Explorar productos</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-black">
        Mi carrito ({count} {count === 1 ? "producto" : "productos"})
      </h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {lines.map((line) => (
            <div key={line.productId} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              <img src={line.image || FALLBACK_PRODUCT_IMAGE} alt={line.name} className="h-24 w-24 rounded-lg bg-surface object-cover" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">SKU: {line.sku}</div>
                <h3 className="mt-0.5 font-semibold leading-snug">{line.name}</h3>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center rounded-md border border-border">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update(line.productId, line.qty - 1)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <div className="w-10 text-center text-sm font-semibold">{line.qty}</div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update(line.productId, line.qty + 1)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-lg font-bold">{formatPrice(line.price * line.qty)}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(line.productId)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-32">
          <h2 className="mb-4 text-lg font-bold">Resumen</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {coupon && (
              <div className="flex justify-between text-success">
                <span>Descuento {coupon.code}</span>
                <span>-{formatPrice(discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Envio</span>
              <span>{shipping === 0 ? <span className="font-semibold text-success">Gratis</span> : formatPrice(shipping)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA (12%)</span>
              <span>{formatPrice(tax)}</span>
            </div>
          </div>
          <div className="my-4 h-px bg-border" />
          <div className="flex items-end justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-black">{formatPrice(total)}</span>
          </div>

          <div className="mt-5 space-y-2">
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                placeholder="Cupon de descuento"
                className="h-10"
              />
              <Button type="button" variant="outline" className="h-10" onClick={applyCoupon} disabled={checkingCoupon}>
                {checkingCoupon ? "..." : "Aplicar"}
              </Button>
            </div>
            <Link to="/checkout" className="block">
              <Button className="h-12 w-full bg-primary text-base font-semibold hover:bg-primary-hover">
                Continuar al pago <ArrowRight className="ml-1 h-4 w-4" />
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
