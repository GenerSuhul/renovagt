import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { FALLBACK_PRODUCT_IMAGE, getPromotionalBanners } from "@/lib/catalog";

export function PromoBanners() {
  const { data: promos = [] } = useQuery({
    queryKey: ["promotional-banners", "home_promo"],
    queryFn: () => getPromotionalBanners("home_promo"),
  });

  if (promos.length === 0) return null;

  return (
    <section className="container mx-auto grid gap-4 px-4 py-8 md:grid-cols-3">
      {promos.map((promo) => (
        <Link
          key={promo.id}
          to={promo.targetUrl || "/"}
          className="group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-xl bg-secondary p-7 text-primary-foreground"
        >
          <img src={promo.image || FALLBACK_PRODUCT_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-br from-black/60 to-primary/70" />
          <div className="relative">
            {promo.subtitle && <div className="text-sm opacity-90">{promo.subtitle}</div>}
            <div className="mt-1 text-2xl font-black md:text-3xl">{promo.title}</div>
          </div>
          <div className="relative flex items-center gap-1 text-sm font-semibold transition-all group-hover:gap-2">
            Ver mas <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      ))}
    </section>
  );
}
