import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getPromotionalBanners } from "@/lib/catalog";

export function Hero() {
  const { data: slides = [] } = useQuery({
    queryKey: ["promotional-banners", "home_slider"],
    queryFn: () => getPromotionalBanners("home_slider"),
  });
  const [index, setIndex] = useState(0);
  const slide = slides[index % Math.max(slides.length, 1)];

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const go = (direction: -1 | 1) => {
    if (slides.length === 0) return;
    setIndex((current) => (current + direction + slides.length) % slides.length);
  };

  if (!slide) {
    return (
      <section className="bg-white">
        <div className="renova-container px-4 py-4">
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <h1 className="text-2xl font-black">Slider pendiente de configuracion</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Crea banners activos con placement home_slider en Supabase.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white">
      <div className="renova-container px-4 py-4">
        <div className="relative min-h-[420px] overflow-hidden rounded-xl bg-secondary shadow-[var(--shadow-card-hover)] md:min-h-[520px]">
          <img
            src={slide.image}
            alt={slide.title}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.18_0.05_250/0.86),oklch(0.18_0.05_250/0.5)_48%,oklch(0.18_0.05_250/0.08))]" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-primary/90" />
          <div className="relative z-10 flex min-h-[420px] max-w-3xl flex-col justify-center px-8 py-10 text-white md:min-h-[520px] md:px-16">
            <div className="w-fit rounded-full bg-white/15 px-4 py-1 text-sm font-black uppercase tracking-[0.2em]">
              {slide.placement}
            </div>
            <h1 className="mt-5 text-4xl font-black leading-[0.98] md:text-6xl">{slide.title}</h1>
            {slide.subtitle && <p className="mt-4 max-w-xl text-lg font-medium text-white/85">{slide.subtitle}</p>}
            <Link
              to={slide.targetUrl || "/"}
              className="mt-8 inline-flex w-fit items-center rounded-full bg-white px-8 py-3 text-sm font-black uppercase tracking-wide text-primary shadow-lg hover:bg-surface"
            >
              Ver mas
            </Link>
          </div>

          {slides.length > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                className="absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-primary shadow-md"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-primary shadow-md"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
                {slides.map((item, itemIndex) => (
                  <button
                    key={item.id}
                    onClick={() => setIndex(itemIndex)}
                    aria-label={`Ir al slide ${itemIndex + 1}`}
                    className={`h-2.5 rounded-full transition-all ${
                      itemIndex === index ? "w-8 bg-white" : "w-2.5 bg-white/60"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
