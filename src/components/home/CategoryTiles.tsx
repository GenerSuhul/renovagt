import { Link } from "@tanstack/react-router";
import {
  Wrench, PaintBucket, HardHat, Zap, Droplet, Lightbulb, Trees, Sofa, Refrigerator,
} from "lucide-react";
import { categories } from "@/lib/mock-data";

const ICONS = { Wrench, PaintBucket, HardHat, Zap, Droplet, Lightbulb, Trees, Sofa, Refrigerator };

export function CategoryTiles() {
  return (
    <section className="container mx-auto px-4 py-12">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-black">Explora por categoría</h2>
          <p className="text-muted-foreground mt-1">Todo lo que necesitas, organizado para ti.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-3">
        {categories.map((c) => {
          const Icon = (ICONS as Record<string, typeof Wrench>)[c.icon ?? "Wrench"] ?? Wrench;
          return (
            <Link
              key={c.id}
              to="/c/$slug"
              params={{ slug: c.slug }}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border hover:border-primary hover:shadow-[var(--shadow-card)] transition-all text-center"
            >
              <div className="h-12 w-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Icon className="h-6 w-6" />
              </div>
              <span className="text-xs font-medium leading-tight">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
