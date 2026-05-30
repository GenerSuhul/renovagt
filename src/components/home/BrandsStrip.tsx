import { useQuery } from "@tanstack/react-query";
import { getBrands } from "@/lib/catalog";

export function BrandsStrip() {
  const { data: brands = [] } = useQuery({ queryKey: ["brands"], queryFn: getBrands });

  return (
    <section className="bg-surface border-y border-border">
      <div className="container mx-auto px-4 py-8">
        <h3 className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
          Las mejores marcas
        </h3>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {brands.map((b) => (
            <div
              key={b.id}
              className="h-14 rounded-lg bg-card border border-border flex items-center justify-center text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {b.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
