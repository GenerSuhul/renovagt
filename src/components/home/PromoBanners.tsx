import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

const PROMOS = [
  {
    title: "Hasta 30% OFF",
    subtitle: "en pintura y accesorios",
    cta: "Ver pintura",
    href: "pintura",
    gradient: "from-primary to-primary-hover",
  },
  {
    title: "Nuevas llegadas",
    subtitle: "Herramientas profesionales",
    cta: "Descubrir",
    href: "herramientas",
    gradient: "from-secondary to-secondary",
  },
  {
    title: "Renueva tu hogar",
    subtitle: "Iluminación y decoración",
    cta: "Comprar ahora",
    href: "iluminacion",
    gradient: "from-accent-foreground to-secondary",
  },
];

export function PromoBanners() {
  return (
    <section className="container mx-auto px-4 grid md:grid-cols-3 gap-4 py-8">
      {PROMOS.map((p) => (
        <Link
          key={p.title}
          to="/c/$slug"
          params={{ slug: p.href }}
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${p.gradient} text-primary-foreground p-7 min-h-[160px] flex flex-col justify-between group`}
        >
          <div>
            <div className="text-sm opacity-90">{p.subtitle}</div>
            <div className="text-2xl md:text-3xl font-black mt-1">{p.title}</div>
          </div>
          <div className="flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all">
            {p.cta} <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      ))}
    </section>
  );
}
