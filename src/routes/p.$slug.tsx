import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Maximize2,
  MessageSquare,
  Minus,
  Plus,
  Send,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { FALLBACK_PRODUCT_IMAGE, getProductBySlug, getRelatedProducts, getShippingMethods, getStores } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProductCard } from "@/components/product/ProductCard";
import type { Product, ShippingMethod, Store as StoreType } from "@/lib/types";

type DbRecord = Record<string, unknown>;

type ProductReview = {
  id: string;
  productId: string;
  userId?: string;
  rating: number;
  title?: string;
  comment: string;
  reviewerName?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

type GenericQuery = {
  select: (columns?: string) => GenericQuery;
  eq: (column: string, value: unknown) => GenericQuery;
  order: (column: string, options?: { ascending?: boolean }) => GenericQuery;
  insert: (payload: DbRecord) => Promise<{ data: DbRecord[] | null; error: Error | null }>;
  then: Promise<{ data: DbRecord[] | null; error: Error | null }>["then"];
};

const reviewFrom = () =>
  (supabase as unknown as { from: (table: string) => GenericQuery }).from("product_reviews");

const asText = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const asNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return fallback;
};

const mapReview = (row: DbRecord): ProductReview => ({
  id: asText(row.id),
  productId: asText(row.product_id),
  userId: asText(row.user_id) || undefined,
  rating: asNumber(row.rating, 5),
  title: asText(row.title) || undefined,
  comment: asText(row.comment),
  reviewerName: asText(row.reviewer_name) || undefined,
  status: asText(row.status, "approved") as ProductReview["status"],
  createdAt: asText(row.created_at),
});

async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const { data, error } = await reviewFrom()
    .select("id, product_id, user_id, rating, title, comment, reviewer_name, status, created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (error) {
    if (!error.message.includes("Could not find the table")) {
      console.warn("[ProductReviews] Query failed", error.message);
    }
    return [];
  }
  return (data ?? []).map(mapReview);
}

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const product = await getProductBySlug(params.slug);
    if (!product) throw notFound();
    const [related, stores, shippingMethods, reviews] = await Promise.all([
      getRelatedProducts(product),
      getStores(),
      getShippingMethods(),
      getProductReviews(product.id),
    ]);
    return { product, related, stores, shippingMethods, reviews };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.product.name} - RENOVA` },
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
      <Link to="/" className="mt-4 inline-block text-primary">
        Volver al inicio
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-20 text-center text-destructive">{error.message}</div>
  ),
});

function ProductPage() {
  const {
    product,
    related: relatedRaw,
    stores: storesRaw,
    shippingMethods: methodsRaw,
    reviews: reviewsRaw,
  } = Route.useLoaderData();
  const related = relatedRaw as Product[];
  const stores = storesRaw as StoreType[];
  const shippingMethods = methodsRaw as ShippingMethod[];
  const initialReviews = reviewsRaw as ProductReview[];
  const deliveryMethod = shippingMethods.find((method) => method.type === "delivery") ?? shippingMethods[0];
  const pickupMethod = shippingMethods.find((method) => method.type === "pickup");
  const { add } = useCart();
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [pickup, setPickup] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [reviews, setReviews] = useState<ProductReview[]>(initialReviews);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const gallery = useMemo(() => {
    const images = product.images?.length ? product.images : [product.image || FALLBACK_PRODUCT_IMAGE];
    return Array.from(new Set(images.filter(Boolean)));
  }, [product.image, product.images]);
  const selectedImage = gallery[selectedIndex] ?? gallery[0] ?? FALLBACK_PRODUCT_IMAGE;
  const approvedReviewCount = reviews.filter((review) => review.status === "approved").length;
  const reviewCount = Math.max(product.reviews, approvedReviewCount);

  useEffect(() => {
    setSelectedIndex(0);
  }, [gallery.length, product.id]);

  useEffect(() => {
    setReviews(initialReviews);
  }, [initialReviews, product.id]);

  const inStock = product.stock > 0;
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const handleAdd = () => {
    if (!inStock) {
      toast.error("Producto sin disponibilidad", { description: product.name });
      return;
    }
    add(product, qty);
    toast.success("Agregado al carrito", { description: `${qty} x ${product.name}` });
  };

  const moveImage = (direction: number) => {
    if (gallery.length <= 1) return;
    setSelectedIndex((current) => (current + direction + gallery.length) % gallery.length);
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

    toast.success("Guardado en favoritos", { description: product.name });
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      toast.error("Inicia sesion para dejar una resena");
      return;
    }
    const comment = reviewComment.trim();
    if (comment.length < 8) {
      toast.error("La resena necesita un poco mas de detalle");
      return;
    }

    setReviewSubmitting(true);
    try {
      const reviewerName = user.email?.split("@")[0] || "Cliente Renova";
      const title = reviewTitle.trim();
      const { error } = await reviewFrom().insert({
        product_id: product.id,
        user_id: user.id,
        rating: reviewRating,
        title: title || null,
        comment,
        reviewer_name: reviewerName,
        status: "pending",
      });

      if (error) throw error;

      setReviews((current) => [
        {
          id: `local-${Date.now()}`,
          productId: product.id,
          userId: user.id,
          rating: reviewRating,
          title: title || undefined,
          comment,
          reviewerName,
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
      setReviewTitle("");
      setReviewComment("");
      setReviewRating(5);
      toast.success("Resena recibida", { description: "Queda pendiente de aprobacion." });
    } catch (error) {
      toast.error("No se pudo enviar la resena", { description: error instanceof Error ? error.message : "Intenta de nuevo." });
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div className="renova-container px-4 py-5">
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Inicio
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link to="/c/$slug" params={{ slug: product.categorySlug }} className="capitalize hover:text-primary">
          {product.categorySlug}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="line-clamp-1 font-medium text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(430px,0.96fr)_minmax(430px,1.04fr)]">
        <div className="grid gap-3 md:grid-cols-[72px_1fr]">
          <div className="order-2 flex gap-2 overflow-x-auto pb-1 md:order-1 md:flex-col md:overflow-visible md:pb-0">
            {gallery.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white p-1 transition-colors ${
                  selectedIndex === index ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/50"
                }`}
                aria-label={`Ver imagen ${index + 1}`}
              >
                <img src={image} alt={`${product.name} ${index + 1}`} className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
          <div className="order-1 relative flex min-h-[430px] items-center justify-center rounded-lg bg-surface p-5 md:order-2">
            {gallery.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/95 shadow"
                  onClick={() => moveImage(-1)}
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/95 shadow"
                  onClick={() => moveImage(1)}
                  aria-label="Imagen siguiente"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-3 z-10 h-10 w-10 rounded-full bg-white/95 shadow"
              onClick={() => setZoomOpen(true)}
              aria-label="Ampliar imagen"
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
            <button
              type="button"
              className="flex h-full w-full items-center justify-center"
              onClick={() => setZoomOpen(true)}
              aria-label="Abrir galeria ampliada"
            >
              <img src={selectedImage || FALLBACK_PRODUCT_IMAGE} alt={product.name} className="aspect-square w-full max-w-[520px] object-contain" />
            </button>
          </div>
        </div>

        <div>
          {product.brand && <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{product.brand}</div>}
          <h1 className="mt-1 text-2xl font-black leading-tight md:text-[1.7rem]">{product.name}</h1>
          <div className="mt-1 text-xs text-muted-foreground">SKU: {product.sku}</div>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i <= Math.round(product.rating) ? "fill-warning text-warning" : "text-muted"}`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{product.rating} - {reviewCount} resenas</span>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <div className="text-3xl font-black text-foreground">{formatPrice(product.price)}</div>
            {product.originalPrice && (
              <>
                <div className="pb-1 text-base text-muted-foreground line-through">{formatPrice(product.originalPrice)}</div>
                <span className="mb-1 rounded bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">-{discount}%</span>
              </>
            )}
          </div>

          <div className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${inStock ? "text-success" : "text-destructive"}`}>
            <Check className="h-4 w-4" /> {inStock ? `Disponible - ${product.stock} en stock` : "Agotado"}
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{product.description}</p>

          <div className="mt-5 space-y-2">
            <button
              onClick={() => setPickup(false)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${!pickup ? "border-primary bg-accent" : "border-border bg-white"}`}
            >
              <Truck className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{deliveryMethod?.name ?? "Envio a domicilio"}</div>
                <div className="text-xs text-muted-foreground">
                  {[deliveryMethod?.estimatedDays, deliveryMethod?.basePrice ? formatPrice(deliveryMethod.basePrice) : undefined]
                    .filter(Boolean)
                    .join(" - ")}
                </div>
              </div>
            </button>
            <button
              onClick={() => setPickup(true)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${pickup ? "border-primary bg-accent" : "border-border bg-white"}`}
            >
              <Store className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-semibold">{pickupMethod?.name ?? "Retiro en tienda"}</div>
                <div className="text-xs text-muted-foreground">Disponible en {stores.length} tiendas</div>
              </div>
            </button>
          </div>

          <div className="mt-5 flex gap-3">
            <div className="flex items-center rounded-md border border-border bg-white">
              <Button variant="ghost" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <div className="w-10 text-center font-semibold">{qty}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setQty((q) => Math.max(1, Math.min(Math.max(product.stock, 1), q + 1)))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="lg"
              className="h-11 flex-1 gap-2 bg-primary text-sm font-black hover:bg-primary-hover"
              disabled={!inStock}
              onClick={handleAdd}
            >
              <ShoppingBag className="h-5 w-5" />
              Agregar al carrito
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11"
              onClick={handleWishlist}
              aria-label="Agregar a favoritos"
            >
              <Heart className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Compra protegida - Garantia del fabricante
          </div>
        </div>
      </div>

      <div className="mt-10">
        <Tabs defaultValue="specs">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="specs">Especificaciones</TabsTrigger>
            <TabsTrigger value="stores">Disponibilidad en tienda</TabsTrigger>
            <TabsTrigger value="shipping">Envio</TabsTrigger>
            <TabsTrigger value="reviews">Resenas</TabsTrigger>
          </TabsList>
          <TabsContent value="specs" className="mt-4">
            <div className="rounded-lg border border-border bg-card p-5">
              {product.specs?.length ? (
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {product.specs.map((spec) => (
                    <div key={spec.label} className="flex justify-between border-b border-border pb-2 text-sm">
                      <dt className="text-muted-foreground">{spec.label}</dt>
                      <dd className="font-medium">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Sin especificaciones tecnicas.</p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="stores" className="mt-4">
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {stores.map((store) => (
                <div key={store.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-semibold">{store.name}</div>
                    <div className="text-xs text-muted-foreground">{store.address} - {store.hours}</div>
                  </div>
                  <span className="text-sm font-semibold text-success">En stock</span>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="shipping" className="mt-4">
            <div className="space-y-2 rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
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
          <TabsContent value="reviews" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <form onSubmit={submitReview} className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black">Deja tu resena</h3>
                    <p className="text-sm text-muted-foreground">Tu comentario se revisa antes de publicarse.</p>
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-1" aria-label="Calificacion">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setReviewRating(rating)}
                      className="rounded p-1 text-warning transition-transform hover:scale-110"
                      aria-label={`${rating} estrellas`}
                    >
                      <Star className={`h-6 w-6 ${rating <= reviewRating ? "fill-warning" : "fill-transparent"}`} />
                    </button>
                  ))}
                </div>

                <label className="mb-3 block text-xs font-bold uppercase text-muted-foreground">
                  Titulo
                  <input
                    value={reviewTitle}
                    onChange={(event) => setReviewTitle(event.target.value)}
                    placeholder="Ej. Buena calidad"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-normal normal-case text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-bold uppercase text-muted-foreground">
                  Comentario
                  <textarea
                    value={reviewComment}
                    onChange={(event) => setReviewComment(event.target.value)}
                    placeholder="Cuenta como te fue con el producto"
                    rows={4}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-normal normal-case text-foreground outline-none focus:border-primary"
                    required
                  />
                </label>
                <Button type="submit" className="mt-4 w-full gap-2" disabled={reviewSubmitting}>
                  <Send className="h-4 w-4" />
                  {reviewSubmitting ? "Enviando..." : "Enviar resena"}
                </Button>
              </form>

              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="text-base font-black">Opiniones de clientes</h3>
                <div className="mt-4 space-y-4">
                  {reviews.length === 0 ? (
                    <p className="rounded-md bg-surface p-4 text-sm text-muted-foreground">
                      Aun no hay resenas aprobadas para este producto.
                    </p>
                  ) : (
                    reviews.map((review) => (
                      <article key={review.id} className="rounded-md border border-border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-bold">{review.reviewerName || "Cliente Renova"}</div>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <Star
                                key={rating}
                                className={`h-4 w-4 ${rating <= review.rating ? "fill-warning text-warning" : "text-muted"}`}
                              />
                            ))}
                          </div>
                        </div>
                        {review.title && <div className="mt-2 font-semibold">{review.title}</div>}
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
                        {review.status === "pending" && (
                          <div className="mt-2 inline-flex rounded-full bg-warning/15 px-2 py-1 text-[11px] font-bold text-warning">
                            Pendiente de aprobacion
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-black">Productos relacionados</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-5xl border-0 bg-white p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{product.name}</DialogTitle>
            <DialogDescription>Galeria ampliada de producto</DialogDescription>
          </DialogHeader>
          <div className="relative flex min-h-[70vh] items-center justify-center bg-surface p-4 md:p-8">
            {gallery.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-white/95 shadow"
                  onClick={() => moveImage(-1)}
                  aria-label="Imagen anterior ampliada"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-white/95 shadow"
                  onClick={() => moveImage(1)}
                  aria-label="Imagen siguiente ampliada"
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}
            <img src={selectedImage || FALLBACK_PRODUCT_IMAGE} alt={product.name} className="max-h-[78vh] w-full object-contain" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
