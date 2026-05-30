import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  ChevronDown,
  Heart,
  MapPin,
  Menu,
  Search,
  ShoppingCart,
  Store,
  Truck,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { getCategories, getProducts, getPromotionalBanners, getShippingMethods } from "@/lib/catalog";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const LOGO_URL = "https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png";
export function Header() {
  const { count } = useCart();
  const { user, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const { data: headerPromos = [] } = useQuery({
    queryKey: ["promotional-banners", "header_promo"],
    queryFn: () => getPromotionalBanners("header_promo"),
  });
  const { data: shippingMethods = [] } = useQuery({ queryKey: ["shipping-methods"], queryFn: getShippingMethods });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "header-search"],
    queryFn: () => getProducts(12),
  });
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLocaleLowerCase("es-GT");

  const productMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return products
      .filter((product) =>
        [product.name, product.brand, product.sku].some((value) =>
          value.toLocaleLowerCase("es-GT").includes(normalizedQuery),
        ),
      )
      .slice(0, 4);
  }, [normalizedQuery, products]);

  const categoryMatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return categories
      .filter((category) => category.name.toLocaleLowerCase("es-GT").includes(normalizedQuery))
      .slice(0, 6);
  }, [categories, normalizedQuery]);

  const hasSearchResults = productMatches.length > 0 || categoryMatches.length > 0;
  const popularSearches = products
    .flatMap((product) => [product.name, product.sku, product.brand])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm">
      {headerPromos[0] && (
      <div className="border-b border-border bg-white text-sm">
        <div className="renova-container flex h-10 items-center justify-center gap-2 px-4 text-center font-semibold text-foreground">
          <BadgePercent className="hidden h-4 w-4 text-primary sm:block" />
          <span>{headerPromos[0].title}</span>
          {headerPromos[0].targetUrl && <Link to={headerPromos[0].targetUrl} className="font-black underline">Ver mas</Link>}
        </div>
      </div>
      )}

      <div className="bg-primary text-primary-foreground">
        <div className="renova-container flex min-h-[88px] items-center gap-5 px-4 py-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 lg:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>Categorías</SheetTitle>
              </SheetHeader>
              <nav className="mt-5 flex flex-col gap-1">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    to="/c/$slug"
                    params={{ slug: category.slug }}
                    className="rounded-md px-3 py-2.5 text-sm font-semibold hover:bg-muted"
                  >
                    {category.name}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex shrink-0 items-center rounded-md bg-white px-4 py-2 shadow-sm">
            <img src={LOGO_URL} alt="Renova" className="h-12 w-[180px] object-contain" />
          </Link>

          <div className="relative mx-auto hidden max-w-3xl flex-1 md:block">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="¿Qué estás buscando?"
              className="h-12 rounded-md border-0 bg-white pl-5 pr-12 text-foreground shadow-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Buscar productos"
            />
            {trimmedQuery.length >= 2 && (
              <SearchPanel
                hasSearchResults={hasSearchResults}
                productMatches={productMatches}
                categoryMatches={categoryMatches}
                trimmedQuery={trimmedQuery}
                onPick={() => setQuery("")}
              />
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="hidden h-12 gap-2 text-primary-foreground hover:bg-white/10 md:flex">
                    <User className="h-7 w-7" />
                    <span className="max-w-[140px] truncate font-bold">{user.email?.split("@")[0]}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild><Link to="/account">Mi cuenta</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/account/orders">Mis pedidos</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/account/wishlist">Lista de deseos</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>Cerrar sesión</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login" className="hidden md:block">
                <Button variant="ghost" className="h-12 gap-2 text-primary-foreground hover:bg-white/10">
                  <User className="h-7 w-7" />
                  <span className="font-bold">Iniciar sesión</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </Link>
            )}

            <Link to="/account/wishlist" className="hidden lg:block">
              <Button variant="ghost" size="icon" className="h-12 w-12 text-primary-foreground hover:bg-white/10">
                <Heart className="h-6 w-6" />
              </Button>
            </Link>

            <Link to="/cart">
              <Button variant="ghost" className="relative h-12 gap-2 text-primary-foreground hover:bg-white/10">
                <ShoppingCart className="h-8 w-8" />
                <span className="hidden font-bold sm:inline">Carrito</span>
                {count > 0 && (
                  <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black text-primary">
                    {count}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-white">
        <div className="renova-container flex h-14 items-center gap-5 overflow-x-auto px-4 text-[15px] font-semibold">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-full shrink-0 items-center gap-1.5 hover:text-primary">
                Categorías <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[330px] p-5">
              <div className="mb-3 text-base font-black">Departamentos</div>
              <div className="max-h-[500px] space-y-1 overflow-y-auto pr-2">
                {categories.map((category) => (
                  <DropdownMenuItem key={category.id} asChild>
                    <Link
                      to="/c/$slug"
                      params={{ slug: category.slug }}
                      className="rounded-md px-2 py-2 text-[15px]"
                    >
                      {category.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-full shrink-0 items-center gap-1.5 hover:text-primary">
                Servicios <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px] p-4">
              {shippingMethods.map((service) => (
                <DropdownMenuItem key={service.id} className="py-2.5 text-[15px]">
                  {service.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-6 w-px shrink-0 bg-border" />
          <Link to="/" className="shrink-0 hover:text-primary">Inicio</Link>
          <Link to="/stores" className="shrink-0 hover:text-primary">Tiendas</Link>
          <Link to="/account/orders" className="shrink-0 hover:text-primary">Mis pedidos</Link>
          {categories.slice(0, 3).map((category) => (
            <Link key={category.id} to="/c/$slug" params={{ slug: category.slug }} className="shrink-0 hover:text-primary">
              {category.name}
            </Link>
          ))}
          <span className="ml-auto hidden shrink-0 items-center gap-2 text-sm text-muted-foreground xl:flex">
            <Truck className="h-4 w-4 text-primary" /> Envío a domicilio
            <Store className="ml-3 h-4 w-4 text-primary" /> Retiro en tienda
          </span>
        </div>
      </div>

      <div className="border-b border-border bg-white px-4 py-3 md:hidden">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="¿Qué estás buscando?"
            className="h-11 rounded-md bg-surface pr-12"
          />
        </div>
      </div>
    </header>
  );
}

function SearchPanel({
  hasSearchResults,
  productMatches,
  categoryMatches,
  trimmedQuery,
  onPick,
}: {
  hasSearchResults: boolean;
  productMatches: Awaited<ReturnType<typeof getProducts>>;
  categoryMatches: Awaited<ReturnType<typeof getCategories>>;
  trimmedQuery: string;
  onPick: () => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card-hover)]">
      {hasSearchResults ? (
        <div className="max-h-[420px] overflow-auto p-2">
          {productMatches.length > 0 && (
            <div>
              <div className="px-2 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                Productos sugeridos
              </div>
              {productMatches.map((product) => (
                <Link
                  key={product.id}
                  to="/p/$slug"
                  params={{ slug: product.slug }}
                  onClick={onPick}
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-muted"
                >
                  <img src={product.image} alt="" className="h-12 w-12 rounded-md bg-surface object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.brand} · {product.sku}
                    </span>
                  </span>
                  <span className="text-sm font-bold">{formatPrice(product.price)}</span>
                </Link>
              ))}
            </div>
          )}
          {categoryMatches.length > 0 && (
            <div className="mt-1 border-t border-border pt-1">
              <div className="px-2 py-1.5 text-[11px] font-bold uppercase text-muted-foreground">
                Categorías
              </div>
              {categoryMatches.map((category) => (
                <Link
                  key={category.id}
                  to="/c/$slug"
                  params={{ slug: category.slug }}
                  onClick={onPick}
                  className="flex items-center justify-between rounded-md p-2 text-sm font-medium hover:bg-muted"
                >
                  {category.name}
                  <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="text-sm text-muted-foreground">No encontramos resultados para "{trimmedQuery}".</div>
        </div>

      )}
    </div>
  );
}
