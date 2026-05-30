import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { getCategoryBySlug, getProductsByCategory } from "@/lib/catalog";
import { ProductCard } from "@/components/product/ProductCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/c/$slug")({
  loader: async ({ params }) => {
    const category = await getCategoryBySlug(params.slug);
    if (!category) throw notFound();
    const products = await getProductsByCategory(params.slug);
    return { category, products };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.category.name} — RENOVA` },
      { name: "description", content: `Compra productos de ${loaderData?.category.name} en RENOVA. Las mejores marcas, precios y envío rápido.` },
    ],
  }),
  component: CategoryPage,
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Categoría no encontrada</h1>
      <Link to="/" className="text-primary mt-4 inline-block">Volver al inicio</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-20 text-center text-destructive">{error.message}</div>
  ),
});

function CategoryPage() {
  const { category, products } = Route.useLoaderData();
  const all = products as import("@/lib/types").Product[];
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [sort, setSort] = useState("relevance");

  const filtered = useMemo(() => {
    let r = all;
    if (selectedBrands.length) r = r.filter((p) => selectedBrands.includes(p.brand));
    switch (sort) {
      case "price-asc": r = [...r].sort((a, b) => a.price - b.price); break;
      case "price-desc": r = [...r].sort((a, b) => b.price - a.price); break;
      case "rating": r = [...r].sort((a, b) => b.rating - a.rating); break;
    }
    return r;
  }, [all, selectedBrands, sort]);

  const availableBrands: string[] = Array.from(new Set(all.map((p) => p.brand)));


  return (
    <div className="container mx-auto px-4 py-6">
      <nav className="text-sm text-muted-foreground flex items-center gap-1 mb-4">
        <Link to="/" className="hover:text-primary">Inicio</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{category.name}</span>
      </nav>

      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black">{category.name}</h1>
          <p className="text-muted-foreground mt-1">{filtered.length} productos</p>
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Más relevantes</SelectItem>
              <SelectItem value="price-asc">Precio: menor a mayor</SelectItem>
              <SelectItem value="price-desc">Precio: mayor a menor</SelectItem>
              <SelectItem value="rating">Mejor calificados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
        <aside className="hidden lg:block">
          <div className="bg-card border border-border rounded-xl p-5 sticky top-32">
            <h3 className="font-bold mb-3">Marcas</h3>
            <div className="space-y-2.5">
              {availableBrands.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <Checkbox
                    id={`brand-${b}`}
                    checked={selectedBrands.includes(b)}
                    onCheckedChange={(c) => {
                      setSelectedBrands((prev) =>
                        c ? [...prev, b] : prev.filter((x) => x !== b),
                      );
                    }}
                  />
                  <Label htmlFor={`brand-${b}`} className="cursor-pointer text-sm font-normal">{b}</Label>
                </div>
              ))}
              {availableBrands.length === 0 && <p className="text-sm text-muted-foreground">Sin filtros disponibles</p>}
            </div>
          </div>
        </aside>

        <div>
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              No se encontraron productos con los filtros seleccionados.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
