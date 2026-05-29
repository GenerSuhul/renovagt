import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/home/Hero";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { PromoBanners } from "@/components/home/PromoBanners";
import { BrandsStrip } from "@/components/home/BrandsStrip";
import { ProductCard } from "@/components/product/ProductCard";
import { products } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RENOVA — Hogar, Construcción y Herramientas en Guatemala" },
      { name: "description", content: "Compra herramientas, pintura, materiales de construcción, iluminación y más. Envíos a todo Guatemala y retiro en tienda." },
    ],
  }),
  component: Home,
});

function Home() {
  const bestsellers = products.filter((p) => p.labels?.includes("bestseller"));
  const newArrivals = products.filter((p) => p.labels?.includes("new") || p.labels?.includes("sale"));

  return (
    <>
      <Hero />
      <CategoryTiles />
      <PromoBanners />

      <Section title="Más vendidos" subtitle="Los favoritos de nuestros clientes">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {bestsellers.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </Section>

      <Section title="Nuevas llegadas y ofertas" subtitle="Recién agregados a nuestro catálogo">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {newArrivals.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </Section>

      <BrandsStrip />
    </>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="container mx-auto px-4 py-12">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-black">{title}</h2>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
