import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { FALLBACK_PRODUCT_IMAGE, getPromotionalBanners } from "@/lib/catalog";

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
            <h1 className="text-2xl font-black">Aun no hay banners activos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Crea un slider principal desde Imagenes y banners para activar esta zona.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white">
      <div className="renova-container px-4 py-3">
        <div className="relative min-h-[340px] overflow-hidden rounded-xl bg-secondary shadow-[var(--shadow-card-hover)] md:min-h-[480px]">
          <picture>
            <source media="(max-width: 767px)" srcSet={slide.mobileImage || slide.desktopImage || slide.image || FALLBACK_PRODUCT_IMAGE} />
            <img
              src={slide.desktopImage || slide.image || FALLBACK_PRODUCT_IMAGE}
              alt={slide.title}
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
            />
          </picture>
          <div className="relative z-10 flex min-h-[340px] max-w-2xl flex-col justify-center px-7 py-10 text-white md:min-h-[480px] md:px-16">
            <h1 className="max-w-2xl text-[2.3rem] font-black leading-[0.98] tracking-normal text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] md:text-[4.2rem]">
              {slide.title}
            </h1>
            {slide.subtitle && (
              <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.42)] md:text-xl">
                {slide.subtitle}
              </p>
            )}
            <Link
              to={slide.targetUrl || "/"}
              className="mt-7 inline-flex w-fit items-center rounded-full bg-white px-7 py-3 text-sm font-black uppercase tracking-wide text-primary shadow-lg transition-colors hover:bg-surface"
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
