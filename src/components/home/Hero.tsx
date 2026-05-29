import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-renova.jpg";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-surface-strong">
      <div className="container mx-auto px-4 py-10 md:py-16 grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-5 relative z-10">
          <span className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground text-xs font-bold px-3 py-1.5 rounded-full">
            ● Temporada de renovación
          </span>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05]">
            Construye, repara,{" "}
            <span className="text-primary">transforma</span> tu hogar.
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg">
            Miles de productos de las mejores marcas en herramientas,
            pintura, construcción y decoración. Envío rápido y retiro en tienda.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/c/$slug" params={{ slug: "herramientas" }}>
              <Button size="lg" className="bg-primary hover:bg-primary-hover h-12 px-7 text-base font-semibold">
                Ver ofertas <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <Link to="/stores">
              <Button size="lg" variant="outline" className="h-12 px-7 text-base font-semibold border-2">
                Encuentra tu tienda
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative">
          <img
            src={heroImg}
            alt="Productos RENOVA"
            width={1920}
            height={1080}
            className="w-full h-auto rounded-2xl shadow-[var(--shadow-card-hover)]"
          />
        </div>
      </div>
    </section>
  );
}
