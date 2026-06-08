import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BadgePercent,
  ChevronDown,
  Heart,
  Menu,
  Search,
  ShoppingCart,
  Store,
  Truck,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import { FALLBACK_PRODUCT_IMAGE, getCategories, getProducts, getPromotionalBanners, getShippingMethods } from "@/lib/catalog";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const LOGO_URL = "https://rpqnenzvnkaytaguvape.supabase.co/storage/v1/object/public/logo/logo%20renova%20ferre%20blanco.png";

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

  return (
    <header className="sticky top-0 z-50 bg-background shadow-sm">
      {headerPromos[0] && (
        <div className="border-b border-border bg-white">
          <div className="renova-container flex h-8 items-center justify-center gap-2 px-4 text-center text-xs font-semibold text-foreground">
            <BadgePercent className="hidden h-4 w-4 text-primary sm:block" />
            <span className="line-clamp-1">{headerPromos[0].title}</span>
            {headerPromos[0].targetUrl && (
              <Link to={headerPromos[0].targetUrl} className="shrink-0 font-black underline">
                Ver mas
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="bg-primary text-primary-foreground">
        <div className="renova-container flex min-h-[62px] items-center gap-2 px-3 py-1 md:min-h-[66px] md:gap-5 md:px-4">
          <MainMenu categories={categories} shippingMethods={shippingMethods} user={user} />

          <Link
            to="/"
            className="mx-auto flex h-[62px] w-[150px] shrink-0 items-center justify-center overflow-hidden md:mx-0 md:h-[66px] md:w-[235px]"
          >
            <img
              src={LOGO_URL}
              alt="Renova"
              className="h-full w-full scale-[2.05] object-contain drop-shadow-sm md:scale-[1.92]"
            />
          </Link>

          <div className="relative mx-auto hidden max-w-[760px] flex-1 md:block">
            <SearchBox
              query={query}
              setQuery={setQuery}
              hasSearchResults={hasSearchResults}
              productMatches={productMatches}
              categoryMatches={categoryMatches}
              trimmedQuery={trimmedQuery}
              subtle
            />
          </div>

          <div className="ml-0 flex shrink-0 items-center gap-1 md:ml-auto md:gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="hidden h-9 gap-2 text-primary-foreground hover:bg-white/10 md:flex">
                    <User className="h-4 w-4" />
                    <span className="max-w-[120px] truncate text-sm font-bold">{user.email?.split("@")[0]}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild><Link to="/account">Mi cuenta</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/account/orders">Mis pedidos</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/account/wishlist">Lista de deseos</Link></DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>Cerrar sesion</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="ghost" className="hidden h-9 gap-2 text-primary-foreground hover:bg-white/10 md:inline-flex">
                <Link to="/login">
                  <User className="h-4 w-4" />
                  <span className="font-bold">Iniciar sesion</span>
                </Link>
              </Button>
            )}

            <Button asChild variant="ghost" size="icon" className="hidden h-9 w-9 text-primary-foreground hover:bg-white/10 lg:inline-flex">
              <Link to="/account/wishlist" aria-label="Lista de deseos">
                <Heart className="h-5 w-5" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="relative h-12 gap-2 px-2 text-primary-foreground hover:bg-white/10 [&_svg]:!size-8 md:h-10 md:px-3 md:[&_svg]:!size-5"
            >
              <Link to="/cart">
                <ShoppingCart />
                <span className="hidden text-sm font-bold sm:inline">Carrito</span>
                {count > 0 && (
                  <span className="absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black text-primary md:right-1 md:top-0 md:h-4 md:min-w-4 md:text-[10px]">
                    {count}
                  </span>
                )}
              </Link>
            </Button>
          </div>
        </div>

        <div className="border-t border-white/10 px-4 pb-3 md:hidden">
          <div className="renova-container px-0">
            <SearchBox
              query={query}
              setQuery={setQuery}
              hasSearchResults={hasSearchResults}
              productMatches={productMatches}
              categoryMatches={categoryMatches}
              trimmedQuery={trimmedQuery}
              subtle
            />
          </div>
        </div>
      </div>

      <div className="hidden border-b border-border bg-white md:block">
        <div className="renova-container flex h-11 items-center gap-6 px-4 text-sm font-semibold">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-full shrink-0 items-center gap-1.5 hover:text-primary">
                Categorias <ChevronDown className="h-4 w-4" />
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
          <span className="ml-auto hidden shrink-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
            <Truck className="h-4 w-4 text-primary" /> Envio a domicilio
            <Store className="ml-3 h-4 w-4 text-primary" /> Retiro en tienda
          </span>
        </div>
      </div>
    </header>
  );
}

function MainMenu({
  categories,
  shippingMethods,
  user,
}: {
  categories: Awaited<ReturnType<typeof getCategories>>;
  shippingMethods: Awaited<ReturnType<typeof getShippingMethods>>;
  user: ReturnType<typeof useAuth>["user"];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0 text-primary-foreground hover:bg-white/10 [&_svg]:!size-8 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[340px] max-w-[86vw] overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-5 text-left">
          <SheetTitle>Menu Renova</SheetTitle>
          <div className="text-sm text-muted-foreground">Departamentos, servicios y accesos rapidos.</div>
        </SheetHeader>
        <div className="p-5">
          <SheetClose asChild>
            <Link
              to={user ? "/account" : "/login"}
              className="mb-5 flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-primary-hover"
            >
              {user ? "Mi cuenta" : "Inicia sesion o crea una cuenta"}
            </Link>
          </SheetClose>

          <MenuSection title="Navegacion">
            <MenuLink to="/" label="Inicio" />
            <MenuLink to="/stores" label="Tiendas" />
            <MenuLink to="/account/orders" label="Mis pedidos" />
          </MenuSection>

          <MenuSection title="Categorias">
            {categories.length === 0 ? (
              <div className="rounded-md bg-surface px-3 py-2 text-sm text-muted-foreground">Sin categorias activas</div>
            ) : (
              categories.map((category) => (
                <SheetClose key={category.id} asChild>
                  <Link
                    to="/c/$slug"
                    params={{ slug: category.slug }}
                    className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold hover:bg-muted"
                  >
                    {category.name}
                    <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                  </Link>
                </SheetClose>
              ))
            )}
          </MenuSection>

          <MenuSection title="Servicios">
            {shippingMethods.length === 0 ? (
              <div className="rounded-md bg-surface px-3 py-2 text-sm text-muted-foreground">Sin servicios configurados</div>
            ) : (
              shippingMethods.map((service) => (
                <div key={service.id} className="rounded-md px-3 py-2.5 text-sm font-semibold">
                  {service.name}
                  <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                    {[service.estimatedDays, service.basePrice ? formatPrice(service.basePrice) : undefined].filter(Boolean).join(" - ")}
                  </div>
                </div>
              ))
            )}
          </MenuSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function MenuLink({ to, label }: { to: "/" | "/stores" | "/account/orders"; label: string }) {
  return (
    <SheetClose asChild>
      <Link to={to} className="flex rounded-md px-3 py-2.5 text-sm font-semibold hover:bg-muted">
        {label}
      </Link>
    </SheetClose>
  );
}

function SearchBox({
  query,
  setQuery,
  hasSearchResults,
  productMatches,
  categoryMatches,
  trimmedQuery,
  subtle,
}: {
  query: string;
  setQuery: (query: string) => void;
  hasSearchResults: boolean;
  productMatches: Awaited<ReturnType<typeof getProducts>>;
  categoryMatches: Awaited<ReturnType<typeof getCategories>>;
  trimmedQuery: string;
  subtle?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-foreground/80" />
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setQuery("");
        }}
        placeholder="Que estas buscando?"
        className={
          subtle
            ? "h-10 rounded-lg border border-white/30 bg-white/95 pl-4 pr-10 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-white/50"
            : "h-10 rounded-lg bg-surface pr-10 text-sm"
        }
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
                  <img src={product.image || FALLBACK_PRODUCT_IMAGE} alt="" className="h-12 w-12 rounded-md bg-surface object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.brand} - {product.sku}
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
                Categorias
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
