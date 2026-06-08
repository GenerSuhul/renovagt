import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CreditCard, LockKeyhole, Store, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { FALLBACK_PRODUCT_IMAGE, getPaymentGateways, getShippingMethods, getStores } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type CheckoutResponse = {
  ok?: boolean;
  order_id?: string;
  order_number?: string;
  status?: string;
  payment_flow?: string;
  reservation_expires_at?: string;
  total?: number;
  error?: string;
};

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout - RENOVA" }] }),
  loader: async () => {
    const [stores, shippingMethods, paymentGateways] = await Promise.all([
      getStores(),
      getShippingMethods(),
      getPaymentGateways(),
    ]);
    return { stores, shippingMethods, paymentGateways };
  },
  component: CheckoutPage,
});

function CheckoutPage() {
  const { stores: storesRaw, shippingMethods: methodsRaw, paymentGateways: gatewaysRaw } = Route.useLoaderData();
  const stores = storesRaw as import("@/lib/types").Store[];
  const shippingMethods = methodsRaw as import("@/lib/types").ShippingMethod[];
  const paymentGateways = gatewaysRaw as import("@/lib/types").PaymentGateway[];
  const { lines, subtotal, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [paymentCode, setPaymentCode] = useState(paymentGateways[0]?.code ?? "");
  const [form, setForm] = useState({
    email: user?.email ?? "",
    name: "",
    phone: "",
    line1: "",
    city: "Guatemala",
    state: "",
    postal: "",
  });
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const deliveryMethod = shippingMethods.find((method) => method.type === "delivery") ?? shippingMethods[0];
  const pickupMethod = shippingMethods.find((method) => method.type === "pickup");
  const selectedPayment = paymentGateways.find((gateway) => gateway.code === paymentCode) ?? paymentGateways[0];
  const shipping =
    fulfillment === "pickup" || !deliveryMethod || (deliveryMethod.freeFrom !== undefined && subtotal >= deliveryMethod.freeFrom)
      ? 0
      : deliveryMethod.basePrice;
  const tax = subtotal * 0.12;
  const total = subtotal + shipping + tax;

  const invokeCheckout = async (body: Record<string, unknown>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!supabaseUrl || !publishableKey) {
      throw new Error("Supabase no esta configurado para procesar pedidos.");
    }
    if (!token) {
      throw new Error("Tu sesion expiro. Inicia sesion nuevamente para confirmar el pedido.");
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/checkout-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": publishableKey,
        "authorization": `Bearer ${token}`,
        "x-client-info": "renova-web-checkout",
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => ({}))) as CheckoutResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `No se pudo procesar el pedido (${response.status}).`);
    }
    return payload;
  };

  if (lines.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Tu carrito esta vacio</h1>
        <Link to="/" className="mt-4 inline-block text-primary">Volver al inicio</Link>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error("Inicia sesion para confirmar tu compra");
      navigate({ to: "/login" });
      return;
    }
    if (!terms) {
      toast.error("Debes aceptar los terminos y condiciones");
      return;
    }
    if (fulfillment === "pickup" && !storeId) {
      toast.error("Selecciona una tienda de retiro");
      return;
    }
    if (!selectedPayment) {
      toast.error("No hay pasarela de pago activa", {
        description: "Configura una pasarela activa desde el administrador.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `checkout:${user.id}:${crypto.randomUUID()}`
          : `checkout:${user.id}:${Date.now()}`;

      const data = await invokeCheckout({
        idempotency_key: idempotencyKey,
        fulfillment,
        store_id: fulfillment === "pickup" ? storeId : null,
        shipping_address: fulfillment === "delivery" ? form : null,
        payment_gateway_code: selectedPayment.code,
        contact: {
          email: form.email || user.email,
          name: form.name,
          phone: form.phone,
        },
        lines: lines.map((line) => ({
          product_id: line.productId,
          sku: line.sku,
          qty: line.qty,
        })),
      });

      clear();
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "renova_checkout_success",
          JSON.stringify({
            orderNumber: data.order_number,
            status: data.status,
            paymentFlow: data.payment_flow,
            reservationExpiresAt: data.reservation_expires_at,
            total: data.total,
          }),
        );
      }
      toast.success("Pedido creado", {
        description: `${data.order_number ?? "Orden"} quedo en ${data.status ?? "proceso"} con reserva temporal.`,
      });
      navigate({ to: "/account/orders" });
    } catch (err) {
      toast.error("Error al procesar pedido", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-black">Finalizar compra</h1>
      {!user && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-black">Necesitas iniciar sesion para confirmar la compra</div>
              <p className="text-sm text-muted-foreground">
                Conservamos tu carrito y seguimos el checkout despues de autenticarte.
              </p>
            </div>
          </div>
          <Link to="/login" className="shrink-0">
            <Button className="bg-primary font-bold hover:bg-primary-hover">Iniciar sesion</Button>
          </Link>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Section title="Informacion de contacto">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Email" required>
                <Input type="email" required value={form.email || user?.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </FormField>
              <FormField label="Telefono" required>
                <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </FormField>
            </div>
          </Section>

          <Section title="Metodo de entrega">
            <RadioGroup value={fulfillment} onValueChange={(value) => setFulfillment(value as "delivery" | "pickup")} className="space-y-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${fulfillment === "delivery" ? "border-primary bg-accent" : "border-border"}`}>
                <RadioGroupItem value="delivery" />
                <Truck className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{deliveryMethod?.name ?? "Envio a domicilio"}</div>
                  <div className="text-xs text-muted-foreground">
                    {[deliveryMethod?.estimatedDays, deliveryMethod?.basePrice ? formatPrice(deliveryMethod.basePrice) : undefined]
                      .filter(Boolean)
                      .join(" - ")}
                  </div>
                </div>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${fulfillment === "pickup" ? "border-primary bg-accent" : "border-border"}`}>
                <RadioGroupItem value="pickup" />
                <Store className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{pickupMethod?.name ?? "Retiro en tienda"}</div>
                  <div className="text-xs text-muted-foreground">{pickupMethod?.estimatedDays ?? ""}</div>
                </div>
              </label>
            </RadioGroup>
          </Section>

          <Section title="Metodo de pago">
            {paymentGateways.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-black">No hay pasarelas activas</div>
                  <p className="mt-1">
                    Activa una pasarela en Administrador / Pasarelas de pago para poder confirmar compras online.
                  </p>
                </div>
              </div>
            ) : (
              <RadioGroup value={paymentCode} onValueChange={setPaymentCode} className="space-y-2">
                {paymentGateways.map((gateway) => (
                  <label key={gateway.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors ${paymentCode === gateway.code ? "border-primary bg-accent" : "border-border"}`}>
                    <RadioGroupItem value={gateway.code} />
                    <CreditCard className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{gateway.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[gateway.provider, gateway.currency, gateway.supportsInstallments ? "Cuotas habilitadas" : undefined]
                          .filter(Boolean)
                          .join(" - ")}
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
          </Section>

          {fulfillment === "delivery" ? (
            <Section title="Direccion de envio">
              <div className="grid gap-4">
                <FormField label="Nombre completo" required>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormField>
                <FormField label="Direccion" required>
                  <Input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Ciudad" required>
                    <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </FormField>
                  <FormField label="Departamento">
                    <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                  </FormField>
                  <FormField label="Codigo postal">
                    <Input value={form.postal} onChange={(e) => setForm({ ...form, postal: e.target.value })} />
                  </FormField>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="Selecciona tienda de retiro">
              <RadioGroup value={storeId} onValueChange={setStoreId} className="space-y-2">
                {stores.map((store) => (
                  <label key={store.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 ${storeId === store.id ? "border-primary bg-accent" : "border-border"}`}>
                    <RadioGroupItem value={store.id} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{store.name}</div>
                      <div className="text-xs text-muted-foreground">{store.address} - {store.hours}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </Section>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-32">
          <h2 className="mb-4 text-lg font-bold">Resumen del pedido</h2>
          <div className="mb-4 max-h-64 space-y-3 overflow-y-auto pr-2">
            {lines.map((line) => (
              <div key={line.productId} className="flex items-start gap-3">
                <img src={line.image || FALLBACK_PRODUCT_IMAGE} alt="" className="h-12 w-12 shrink-0 rounded bg-surface object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="line-clamp-2 leading-tight">{line.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">x{line.qty} - {formatPrice(line.price)}</div>
                </div>
                <div className="text-sm font-semibold">{formatPrice(line.price * line.qty)}</div>
              </div>
            ))}
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Envio</span><span>{shipping === 0 ? <span className="text-success">Gratis</span> : formatPrice(shipping)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatPrice(tax)}</span></div>
          </div>
          <div className="my-3 h-px bg-border" />
          <div className="flex items-end justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-black">{formatPrice(total)}</span>
          </div>

          <div className="mt-5 flex items-start gap-2">
            <Checkbox id="terms" checked={terms} onCheckedChange={(value) => setTerms(!!value)} />
            <Label htmlFor="terms" className="text-xs font-normal leading-snug">
              Acepto los <Link to="/terms" className="text-primary underline">terminos y condiciones</Link> y la politica de privacidad.
            </Label>
          </div>

          <Button type="submit" disabled={submitting || !selectedPayment} className="mt-4 h-12 w-full bg-primary text-base font-semibold hover:bg-primary-hover">
            {submitting ? "Procesando..." : <><CheckCircle2 className="mr-1 h-5 w-5" /> Confirmar pedido</>}
          </Button>
        </aside>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}{required && <span className="ml-0.5 text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}
