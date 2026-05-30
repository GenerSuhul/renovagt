import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Star, Truck, Store, ShieldCheck, Heart, Minus, Plus, Check } from "lucide-react";
import { getProductBySlug, getRelatedProducts, getShippingMethods, getStores } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCart } from "@/contexts/CartContext";
import { ProductCard } from "@/components/product/ProductCard";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const product = await getProductBySlug(params.slug);
    if (!product) throw notFound();
    const [related, stores, shippingMethods] = await Promise.all([
      getRelatedProducts(product),
      getStores(),
      getShippingMethods(),
    ]);
    return { product, related, stores, shippingMethods };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.product.name} — RENOVA` },
      { name: "description", content: loaderData?.product.description ?? "" },
      { property: "og:title", content: loaderData?.product.name ?? "" },
      { property: "og:description", content: loaderData?.product.description ?? "" },
      { property: "og:image", content: loaderData?.product.image ?? "" },
    ],
  }),
  component: ProductPage,
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Producto no encontrado</h1>
      <Link to="/" className="text-primary mt-4 inline-block">Volver al inicio</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-20 text-center text-destructive">{error.message}</div>
  ),
});

function ProductPage() {
  const { product, related: relatedRaw, stores: storesRaw, shippingMethods: methodsRaw } = Route.useLoaderData();
  const related = relatedRaw as import("@/lib/types").Product[];
  const stores = storesRaw as import("@/lib/types").Store[];
  const shippingMethods = methodsRaw as import("@/lib/types").ShippingMethod[];
  const deliveryMethod = shippingMethods.find((method) => method.type === "delivery") ?? shippingMethods[0];
  const pickupMethod = shippingMethods.find((method) => method.type === "pickup");
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [pickup, setPickup] = useState(false);


  const inStock = product.stock > 0;
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const handleAdd = () => {
    add(product, qty);
    toast.success("Agregado al carrito", { description: `${qty} × ${product.name}` });
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <nav className="text-sm text-muted-foreground flex items-center gap-1 mb-4 flex-wrap">
        <Link to="/" className="hover:text-primary">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/c/$slug" params={{ slug: product.categorySlug }} className="hover:text-primary capitalize">{product.categorySlug}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium line-clamp-1">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-10">
        <div className="bg-surface rounded-2xl p-6 flex items-center justify-center">
          <img src={product.image} alt={product.name} className="w-full max-w-md aspect-square object-contain" />
        </div>

        <div>
          <div className="text-sm uppercase tracking-wide text-muted-foreground">{product.brand}</div>
          <h1 className="text-2xl md:text-3xl font-black mt-1">{product.name}</h1>
          <div className="text-xs text-muted-foreground mt-1">SKU: {product.sku}</div>

          <div className="flex items-center gap-2 mt-3">
            <div className="flex">
              {[1,2,3,4,5].map((i) => (
                <Star key={i} className={`h-4 w-4 ${i <= Math.round(product.rating) ? "fill-warning text-warning" : "text-muted"}`} />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{product.rating} · {product.reviews} reseñas</span>
          </div>

          <div className="mt-5 flex items-end gap-3">
            <div className="text-4xl font-black text-foreground">{formatPrice(product.price)}</div>
            {product.originalPrice && (
              <>
                <div className="text-lg text-muted-foreground line-through pb-1">{formatPrice(product.originalPrice)}</div>
                <span className="bg-destructive text-destructive-foreground text-xs font-bold px-2 py-1 rounded mb-1">-{discount}%</span>
              </>
            )}
          </div>

          <div className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${inStock ? "text-success" : "text-destructive"}`}>
            <Check className="h-4 w-4" /> {inStock ? `Disponible — ${product.stock} en stock` : "Agotado"}
          </div>

          <p className="text-muted-foreground mt-4 leading-relaxed">{product.description}</p>

          {/* Fulfillment */}
          <div className="mt-6 space-y-2">
            <button
              onClick={() => setPickup(false)}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-colors ${!pickup ? "border-primary bg-accent" : "border-border"}`}
            >
              <Truck className="h-5 w-5 mt-0.5 text-primary" />
              <div className="flex-1">
                <div className="font-semibold text-sm">{deliveryMethod?.name ?? "Envio a domicilio"}</div>
                <div className="text-xs text-muted-foreground">
                  {[deliveryMethod?.estimatedDays, deliveryMethod?.basePrice ? formatPrice(deliveryMethod.basePrice) : undefined]
                    .filter(Boolean)
                    .join(" - ")}
                </div>
              </div>
            </button>
            <button
              onClick={() => setPickup(true)}
              className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border-2 transition-colors ${pickup ? "border-primary bg-accent" : "border-border"}`}
            >
              <Store className="h-5 w-5 mt-0.5 text-primary" />
              <div className="flex-1">
                <div className="font-semibold text-sm">{pickupMethod?.name ?? "Retiro en tienda"}</div>
                <div className="text-xs text-muted-foreground">Disponible en {stores.length} tiendas</div>
              </div>
            </button>
          </div>

          {/* Qty + CTA */}
          <div className="mt-6 flex gap-3">
            <div className="flex items-center border border-border rounded-md">
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
              <div className="w-10 text-center font-semibold">{qty}</div>
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.min(product.stock, q + 1))}><Plus className="h-4 w-4" /></Button>
            </div>
            <Button
              size="lg"
              className="flex-1 bg-primary hover:bg-primary-hover h-12 text-base font-semibold"
              disabled={!inStock}
              onClick={handleAdd}
            >
              Agregar al carrito
            </Button>
            <Button size="lg" variant="outline" className="h-12">
              <Heart className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Compra protegida · Garantía del fabricante
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12">
        <Tabs defaultValue="specs">
          <TabsList>
            <TabsTrigger value="specs">Especificaciones</TabsTrigger>
            <TabsTrigger value="stores">Disponibilidad en tienda</TabsTrigger>
            <TabsTrigger value="shipping">Envío</TabsTrigger>
          </TabsList>
          <TabsContent value="specs" className="mt-4">
            <div className="bg-card border border-border rounded-xl p-6">
              {product.specs?.length ? (
                <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                  {product.specs.map((s: { label: string; value: string }) => (
                    <div key={s.label} className="flex justify-between border-b border-border pb-2 text-sm">
                      <dt className="text-muted-foreground">{s.label}</dt>
                      <dd className="font-medium">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-muted-foreground text-sm">Sin especificaciones técnicas.</p>}
            </div>
          </TabsContent>
          <TabsContent value="stores" className="mt-4">
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {stores.map((s: typeof stores[number]) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.address} · {s.hours}</div>
                  </div>
                  <span className="text-sm text-success font-semibold">En stock</span>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="shipping" className="mt-4">
            <div className="bg-card border border-border rounded-xl p-6 text-sm space-y-2 text-muted-foreground">
              {shippingMethods.length === 0 ? (
                <p>No hay metodos de envio configurados.</p>
              ) : (
                shippingMethods.map((method) => (
                  <p key={method.id}>
                    {method.name}: {[method.estimatedDays, method.basePrice ? formatPrice(method.basePrice) : undefined]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-black mb-4">Productos relacionados</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
