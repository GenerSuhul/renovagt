import { Outlet, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Heart, Package, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

type OrderSummary = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
};

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Mi cuenta - RENOVA" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [wishlistCount, setWishlistCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => setOrders((data ?? []) as OrderSummary[]));
    supabase
      .from("wishlist_items")
      .select("id")
      .eq("user_id", user.id)
      .then(({ data }) => setWishlistCount(data?.length ?? 0));
  }, [user]);

  if (pathname !== "/account") return <Outlet />;
  if (loading) return <AccountLoading label="Cargando tu cuenta..." />;
  if (!loading && !user) return <AccountGate />;

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Cuenta RENOVA</div>
          <h1 className="mt-2 text-3xl font-black">Hola, {user?.email?.split("@")[0] ?? "cliente"}</h1>
          <p className="mt-1 text-muted-foreground">Consulta compras, favoritos y datos conectados a tu perfil.</p>
        </div>
        <Link to="/checkout">
          <Button variant="outline">Volver al checkout</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Package} label="Pedidos recientes" value={String(orders.length)} />
        <Metric icon={Heart} label="Favoritos" value={String(wishlistCount)} />
        <Metric icon={ShieldCheck} label="Sesion" value="Activa" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-black">Ultimos pedidos</h2>
            <Link to="/account/orders" className="text-sm font-bold text-primary">Ver todos</Link>
          </div>
          {orders.length === 0 ? (
            <EmptyState label="Aun no tienes pedidos" action="Ir a comprar" to="/" />
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 text-sm">
                  <div>
                    <div className="font-black">{order.order_number}</div>
                    <div className="text-muted-foreground">{order.status} / {order.payment_status}</div>
                  </div>
                  <div className="font-black">{formatPrice(order.total)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <User className="h-8 w-8 text-primary" />
          <h2 className="mt-4 font-black">Datos de acceso</h2>
          <div className="mt-3 rounded-lg bg-surface p-3 text-sm">
            <div className="text-muted-foreground">Email</div>
            <div className="font-bold">{user?.email}</div>
          </div>
          <Link to="/account/wishlist" className="mt-4 block">
            <Button className="w-full bg-primary font-bold hover:bg-primary-hover">Ver lista de deseos</Button>
          </Link>
        </section>
      </div>
    </div>
  );
}

function AccountGate() {
  return (
    <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <h1 className="text-2xl font-black">Inicia sesion para ver tu cuenta</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tus pedidos y favoritos se muestran desde Supabase.</p>
        <Link to="/login" className="mt-5 inline-block">
          <Button className="bg-primary font-bold hover:bg-primary-hover">Iniciar sesion</Button>
        </Link>
      </div>
    </div>
  );
}

function AccountLoading({ label }: { label: string }) {
  return (
    <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
      <div className="rounded-xl border border-border bg-card p-6 text-center font-black">{label}</div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <Icon className="h-6 w-6 text-primary" />
      <div className="mt-4 text-2xl font-black">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({ label, action, to }: { label: string; action: string; to: "/" }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <div className="font-black">{label}</div>
      <Link to={to} className="mt-3 inline-block text-sm font-bold text-primary">{action}</Link>
    </div>
  );
}
