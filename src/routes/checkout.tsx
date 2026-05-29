import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice } from "@/lib/format";
import { stores } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, Truck, Store } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — RENOVA" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { lines, subtotal, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [storeId, setStoreId] = useState(stores[0].id);
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

  const shipping = fulfillment === "pickup" ? 0 : subtotal > 500 ? 0 : 45;
  const tax = subtotal * 0.12;
  const total = subtotal + shipping + tax;

  if (lines.length === 0) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Tu carrito está vacío</h1>
        <Link to="/" className="text-primary mt-4 inline-block">Volver al inicio</Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) {
      toast.error("Debes aceptar los términos y condiciones");
      return;
    }
    setSubmitting(true);
    try {
      if (user) {
        const { error } = await supabase.from("orders").insert({
          user_id: user.id,
          status: "pending",
          fulfillment,
          store_id: fulfillment === "pickup" ? storeId : null,
          shipping_address: fulfillment === "delivery" ? form : null,
          subtotal,
          shipping,
          tax,
          total,
          items: lines,
        });
        if (error) throw error;
      }
      clear();
      toast.success("¡Pedido confirmado!", { description: "Te enviaremos un email con los detalles." });
      navigate({ to: user ? "/account/orders" : "/" });
    } catch (err) {
      toast.error("Error al procesar pedido", { description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-black mb-6">Finalizar compra</h1>
      <div className="grid lg:grid-cols-[1fr_400px] gap-8">
        <div className="space-y-6">
          {/* Contact */}
          <Section title="Información de contacto">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Email" required>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </FormField>
              <FormField label="Teléfono" required>
                <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </FormField>
            </div>
            {!user && (
              <p className="text-xs text-muted-foreground mt-3">
                ¿Tienes cuenta? <Link to="/login" className="text-primary font-semibold">Inicia sesión</Link> para acceder a tus direcciones.
              </p>
            )}
          </Section>

          {/* Fulfillment */}
          <Section title="Método de entrega">
            <RadioGroup value={fulfillment} onValueChange={(v) => setFulfillment(v as "delivery" | "pickup")} className="space-y-2">
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${fulfillment === "delivery" ? "border-primary bg-accent" : "border-border"}`}>
                <RadioGroupItem value="delivery" />
                <Truck className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Envío a domicilio</div>
                  <div className="text-xs text-muted-foreground">24-72h hábiles · Q45 (gratis &gt; Q500)</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${fulfillment === "pickup" ? "border-primary bg-accent" : "border-border"}`}>
                <RadioGroupItem value="pickup" />
                <Store className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm">Retiro en tienda — Gratis</div>
                  <div className="text-xs text-muted-foreground">Listo al siguiente día hábil</div>
                </div>
              </label>
            </RadioGroup>
          </Section>

          {fulfillment === "delivery" ? (
            <Section title="Dirección de envío">
              <div className="grid gap-4">
                <FormField label="Nombre completo" required>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormField>
                <FormField label="Dirección" required>
                  <Input required value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
                </FormField>
                <div className="grid sm:grid-cols-3 gap-4">
                  <FormField label="Ciudad" required>
                    <Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </FormField>
                  <FormField label="Departamento">
                    <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                  </FormField>
                  <FormField label="Código postal">
                    <Input value={form.postal} onChange={(e) => setForm({ ...form, postal: e.target.value })} />
                  </FormField>
                </div>
              </div>
            </Section>
          ) : (
            <Section title="Selecciona tienda de retiro">
              <RadioGroup value={storeId} onValueChange={setStoreId} className="space-y-2">
                {stores.map((s) => (
                  <label key={s.id} className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer ${storeId === s.id ? "border-primary bg-accent" : "border-border"}`}>
                    <RadioGroupItem value={s.id} />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.address} · {s.hours}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </Section>
          )}

          <Section title="Pago">
            <div className="bg-accent border border-primary/20 rounded-lg p-4 text-sm">
              <strong className="text-accent-foreground">Modo demostración:</strong>
              <span className="text-muted-foreground ml-1">El pago real se integrará con el procesador del cliente (Visanet/Recurrente). Por ahora se simula la confirmación.</span>
            </div>
          </Section>
        </div>

        <aside className="bg-card border border-border rounded-xl p-6 h-fit sticky top-32">
          <h2 className="font-bold text-lg mb-4">Resumen del pedido</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2 mb-4">
            {lines.map((l) => (
              <div key={l.productId} className="flex gap-3 items-start">
                <img src={l.image} alt="" className="h-12 w-12 rounded object-cover bg-surface shrink-0" />
                <div className="flex-1 text-sm min-w-0">
                  <div className="line-clamp-2 leading-tight">{l.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">x{l.qty} · {formatPrice(l.price)}</div>
                </div>
                <div className="font-semibold text-sm">{formatPrice(l.price * l.qty)}</div>
              </div>
            ))}
          </div>
          <div className="h-px bg-border my-3" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Envío</span><span>{shipping === 0 ? <span className="text-success">Gratis</span> : formatPrice(shipping)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{formatPrice(tax)}</span></div>
          </div>
          <div className="h-px bg-border my-3" />
          <div className="flex justify-between items-end">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-black">{formatPrice(total)}</span>
          </div>

          <div className="flex items-start gap-2 mt-5">
            <Checkbox id="terms" checked={terms} onCheckedChange={(v) => setTerms(!!v)} />
            <Label htmlFor="terms" className="text-xs leading-snug font-normal">
              Acepto los <a href="#" className="text-primary underline">términos y condiciones</a> y la política de privacidad.
            </Label>
          </div>

          <Button type="submit" disabled={submitting} className="w-full mt-4 bg-primary hover:bg-primary-hover h-12 text-base font-semibold">
            {submitting ? "Procesando..." : <><CheckCircle2 className="h-5 w-5 mr-1" /> Confirmar pedido</>}
          </Button>
        </aside>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="font-bold text-lg mb-4">{title}</h2>
      {children}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}
