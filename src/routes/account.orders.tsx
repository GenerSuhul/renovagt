import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, Clock3, CreditCard, PackageCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  fulfillment: string;
  payment_method?: string | null;
  reservation_expires_at?: string | null;
  total: number;
  created_at: string;
  items: unknown;
};

type CheckoutNotice = {
  orderNumber?: string;
  status?: string;
  paymentFlow?: string;
  reservationExpiresAt?: string;
  total?: number;
};

export const Route = createFileRoute("/account/orders")({
  head: () => ({ meta: [{ title: "Mis pedidos - RENOVA" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<CheckoutNotice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("renova_checkout_success");
    if (!raw) return;
    try {
      setNotice(JSON.parse(raw) as CheckoutNotice);
    } catch {
      setNotice(null);
    } finally {
      sessionStorage.removeItem("renova_checkout_success");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, payment_method, fulfillment, reservation_expires_at, total, created_at, items")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as OrderRow[]))
      .finally(() => setFetching(false));
  }, [user]);

  if (loading) {
    return (
      <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center font-black">Cargando pedidos...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto grid min-h-[60vh] place-items-center px-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <h1 className="text-2xl font-black">Inicia sesion para ver tus pedidos</h1>
          <Link to="/login" className="mt-5 inline-block">
            <Button className="bg-primary font-bold hover:bg-primary-hover">Iniciar sesion</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Cuenta RENOVA</div>
          <h1 className="mt-2 text-3xl font-black">Mis pedidos</h1>
        </div>
        <Link to="/">
          <Button variant="outline">Seguir comprando</Button>
        </Link>
      </div>

      {notice && (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-black">Pedido recibido {notice.orderNumber ? `- ${notice.orderNumber}` : ""}</div>
                <p className="mt-1 text-sm">
                  Reserva creada correctamente. {notice.paymentFlow === "card"
                    ? "Estamos esperando la confirmacion de la pasarela para facturar."
                    : "El equipo operativo debe validar el pago antes de facturar."}
                </p>
              </div>
            </div>
            {notice.total !== undefined && <div className="font-black">{formatPrice(notice.total)}</div>}
          </div>
        </div>
      )}

      {fetching ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center font-bold">Cargando pedidos...</div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 font-black">Aun no tienes pedidos</h2>
          <Link to="/" className="mt-4 inline-block">
            <Button className="bg-primary font-bold hover:bg-primary-hover">Ir a comprar</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString("es-GT")}</div>
                  <h2 className="mt-1 text-lg font-black">{order.order_number}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    <StatusPill status={order.status} />
                    <PaymentPill status={order.payment_status} method={order.payment_method} />
                    <span className="rounded-full bg-surface px-2.5 py-1 text-muted-foreground">
                      {order.fulfillment === "pickup" ? "Retiro en tienda" : "Envio a domicilio"}
                    </span>
                  </div>
                </div>
                <div className="text-xl font-black">{formatPrice(order.total)}</div>
              </div>
              <div className="mt-4 rounded-lg bg-surface p-3 text-sm">
                <div className="flex items-start gap-2">
                  <NextStepIcon order={order} />
                  <div>
                    <div className="font-black">{nextStepTitle(order)}</div>
                    <div className="mt-0.5 text-muted-foreground">{nextStepDescription(order)}</div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = statusLabel(status);
  const color = status.includes("pending")
    ? "bg-amber-100 text-amber-900"
    : status.includes("rejected") || status === "expired"
      ? "bg-red-100 text-red-900"
      : "bg-emerald-100 text-emerald-900";
  return <span className={`rounded-full px-2.5 py-1 ${color}`}>{label}</span>;
}

function PaymentPill({ status, method }: { status: string; method?: string | null }) {
  const label = paymentLabel(status);
  const color = status === "payment_confirmed" ? "bg-emerald-100 text-emerald-900" : "bg-orange-100 text-orange-950";
  return <span className={`rounded-full px-2.5 py-1 ${color}`}>{method ? `${label} - ${method}` : label}</span>;
}

function NextStepIcon({ order }: { order: OrderRow }) {
  if (order.payment_status !== "payment_confirmed") return <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  if (order.status === "ready_for_pickup") return <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  if (order.status === "fulfillment_pending") return <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  return <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_payment: "Esperando pago",
    pending_bank_transfer: "Transferencia pendiente",
    pending_store_payment: "Pago pendiente",
    payment_rejected: "Pago rechazado",
    fulfillment_pending: "Preparando pedido",
    ready_for_pickup: "Listo para retiro",
    expired: "Reserva vencida",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function paymentLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pago pendiente",
    payment_confirmed: "Pago confirmado",
    rejected: "Pago rechazado",
    expired: "Pago vencido",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function nextStepTitle(order: OrderRow) {
  if (order.status === "expired") return "Reserva vencida";
  if (order.payment_status !== "payment_confirmed") return "Pendiente de confirmacion de pago";
  if (order.status === "ready_for_pickup") return "Puedes retirar cuando tienda confirme disponibilidad";
  if (order.status === "fulfillment_pending") return "Estamos preparando tu entrega";
  return "Pedido en proceso";
}

function nextStepDescription(order: OrderRow) {
  if (order.status === "expired") return "La reserva fue liberada. Puedes volver a comprar si el producto sigue disponible.";
  if (order.payment_status !== "payment_confirmed") {
    const expiry = order.reservation_expires_at ? ` Reserva valida hasta ${new Date(order.reservation_expires_at).toLocaleString("es-GT")}.` : "";
    return `Cuando el pago sea aprobado, confirmaremos inventario y enviaremos la orden a SAP.${expiry}`;
  }
  if (order.status === "ready_for_pickup") return "La tienda validara el pago en caja antes de facturar y entregar.";
  if (order.status === "fulfillment_pending") return "La reserva ya esta comprometida y el pedido entra a preparacion logistica.";
  return "Te mostraremos los cambios de estado en esta misma pantalla.";
}
