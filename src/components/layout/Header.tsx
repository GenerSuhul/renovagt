import { Link } from "@tanstack/react-router";
import { Search, ShoppingCart, User, Heart, MapPin, Menu, ChevronDown, Phone } from "lucide-react";
import { useState } from "react";
import { categories } from "@/lib/mock-data";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function Header() {
  const { count } = useCart();
  const { user, signOut } = useAuth();
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-50 bg-background border-b border-border">
      {/* Top utility bar */}
      <div className="bg-secondary text-secondary-foreground text-xs">
        <div className="container mx-auto px-4 h-9 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> +502 2222 1010</span>
            <Link to="/stores" className="hidden sm:flex items-center gap-1.5 hover:text-primary-foreground/80">
              <MapPin className="h-3.5 w-3.5" /> Encuentra tu tienda
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-4 opacity-90">
            <span>Envíos a todo Guatemala</span>
            <span>·</span>
            <span>Atención L-D 8:00-20:00</span>
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div className="container mx-auto px-4 py-3 flex items-center gap-4">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <SheetHeader>
              <SheetTitle>Categorías</SheetTitle>
            </SheetHeader>
            <nav className="mt-4 flex flex-col gap-1">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  to="/c/$slug"
                  params={{ slug: c.slug }}
                  className="px-3 py-2.5 rounded-md hover:bg-muted text-sm font-medium"
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-black text-lg">
            R
          </div>
          <span className="font-black text-xl tracking-tight hidden sm:inline">RENOVA</span>
        </Link>

        {/* Search */}
        <div className="flex-1 max-w-2xl mx-auto">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca herramientas, pintura, materiales..."
              className="pl-9 h-11 bg-surface border-border focus-visible:ring-primary"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="hidden md:flex gap-1.5 h-11">
                  <User className="h-5 w-5" />
                  <span className="text-sm font-medium max-w-[100px] truncate">
                    {user.email?.split("@")[0]}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild><Link to="/account">Mi cuenta</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/account/orders">Mis pedidos</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/account/wishlist">Lista de deseos</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/account/addresses">Direcciones</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>Cerrar sesión</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/login" className="hidden md:flex">
              <Button variant="ghost" className="gap-1.5 h-11">
                <User className="h-5 w-5" />
                <span className="text-sm font-medium">Ingresar</span>
              </Button>
            </Link>
          )}

          <Link to="/account/wishlist" className="hidden sm:block">
            <Button variant="ghost" size="icon" className="h-11 w-11">
              <Heart className="h-5 w-5" />
            </Button>
          </Link>

          <Link to="/cart">
            <Button variant="ghost" size="icon" className="h-11 w-11 relative">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute top-1 right-1 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Category nav */}
      <nav className="hidden lg:block border-t border-border bg-surface">
        <div className="container mx-auto px-4 flex items-center gap-1 h-11 overflow-x-auto">
          {categories.map((c) => (
            <Link
              key={c.id}
              to="/c/$slug"
              params={{ slug: c.slug }}
              className="px-3 h-full flex items-center text-sm font-medium text-muted-foreground hover:text-primary whitespace-nowrap transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
