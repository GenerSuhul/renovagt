import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Droplet,
  HardHat,
  Lightbulb,
  PaintBucket,
  Refrigerator,
  Sofa,
  Trees,
  Wrench,
  Zap,
} from "lucide-react";
import { getCategories } from "@/lib/catalog";

const ICONS = { Wrench, PaintBucket, HardHat, Zap, Droplet, Lightbulb, Trees, Sofa, Refrigerator };

export function CategoryTiles() {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  if (categories.length === 0) return null;

  return (
    <section className="renova-container px-4 py-5">
      <div className="mb-4">
        <h2 className="text-2xl font-black md:text-3xl">Compra por departamento</h2>
        <p className="mt-1 text-muted-foreground">Encuentra rápido lo que necesitas para tu proyecto.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => {
          const Icon = (ICONS as Record<string, typeof Wrench>)[category.icon ?? "Wrench"] ?? Wrench;
          return (
            <Link
              key={category.id}
              to="/c/$slug"
              params={{ slug: category.slug }}
              className="group relative min-h-[230px] overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
            >
              {category.image && (
                <img
                  src={category.image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
              <div className="relative z-10 flex h-full min-h-[230px] flex-col justify-between p-6 text-white">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black">{category.name}</h3>
                  <span className="mt-4 inline-flex rounded-md bg-white px-5 py-2 text-sm font-bold text-foreground">
                    Ver productos
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
