import { createFileRoute } from "@tanstack/react-router";
import { BadgePercent, Store, Truck } from "lucide-react";
import { Hero } from "@/components/home/Hero";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { PromoBanners } from "@/components/home/PromoBanners";
import { BrandsStrip } from "@/components/home/BrandsStrip";
import { ProductCard } from "@/components/product/ProductCard";
import { getProducts, getShippingMethods, getStores } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [products, shippingMethods, stores] = await Promise.all([
      getProducts(24),
      getShippingMethods(),
      getStores(),
    ]);
    return { products, shippingMethods, stores };
  },
  head: () => ({
    meta: [
      { title: "RENOVA - Ecommerce" },
      {
        name: "description",
        content: "Ecommerce RENOVA conectado a catalogo, inventario, banners y reglas comerciales dinamicas.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { products, shippingMethods, stores } = Route.useLoaderData();
  const bestsellers = (products as Product[]).filter((p) => p.labels?.includes("bestseller"));
  const newArrivals = (products as Product[]).filter((p) => p.labels?.includes("new") || p.labels?.includes("sale"));
  const recommended = (products as Product[]).filter((p) => !p.labels?.includes("bestseller")).slice(0, 8);


  return (
    <div className="enterprise-shell">
      <Hero />
      <CategoryTiles />
      <PromoBanners />
      <RetailBenefits shippingMethods={shippingMethods} stores={stores} />

      <Section title="Mas vendidos" subtitle="Productos marcados como bestseller en catalogo.">
        <ProductGrid products={bestsellers} />
      </Section>

      <Section title="Ofertas y nuevas llegadas" subtitle="Productos con etiquetas new o sale en Supabase.">
        <ProductGrid products={newArrivals} />
      </Section>

      <Section title="Recomendados para ti" subtitle="Productos activos disponibles para compra online.">
        <ProductGrid products={recommended} />
      </Section>

      <BrandsStrip />
    </div>
  );
}

function RetailBenefits({
  shippingMethods,
  stores,
}: {
  shippingMethods: Awaited<ReturnType<typeof getShippingMethods>>;
  stores: Awaited<ReturnType<typeof getStores>>;
}) {
  const benefits = [
    ...shippingMethods.map((method) => ({
      icon: Truck,
      title: method.name,
      text: [method.estimatedDays, method.basePrice ? `Desde ${method.basePrice}` : undefined]
        .filter(Boolean)
        .join(" - "),
    })),
    ...stores.slice(0, 4).map((store) => ({
      icon: Store,
      title: store.name,
      text: [store.city, store.hours].filter(Boolean).join(" - "),
    })),
  ];

  if (benefits.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-6">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-4">
        {benefits.map((benefit) => (
          <div key={`${benefit.title}-${benefit.text}`} className="flex gap-3 rounded-lg p-3">
            <benefit.icon className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <div className="font-black">{benefit.title}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{benefit.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductGrid({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h3 className="text-lg font-black">Sin datos dinamicos para esta seccion</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Configura productos y etiquetas en Supabase para poblar esta vista.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="container mx-auto px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary">
            <BadgePercent className="h-4 w-4" />
            Tienda RENOVA
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight md:text-4xl">{title}</h2>
          {subtitle && <p className="mt-1 max-w-2xl text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
