import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terminos y condiciones - RENOVA" }] }),
  component: () => (
    <LegalPage
      title="Terminos y condiciones"
      sections={[
        ["Compras", "Los pedidos se registran en Supabase y quedan sujetos a validacion de pago, disponibilidad de inventario y confirmacion operativa."],
        ["Pagos", "Las pasarelas configuradas por el administrador procesan la autorizacion. RENOVA no almacena datos sensibles de tarjetas en el frontend."],
        ["Entrega", "La entrega puede ser a domicilio o retiro en tienda segun cobertura, peso, disponibilidad y reglas logisticas vigentes."],
      ]}
    />
  ),
});

function LegalPage({ title, sections }: { title: string; sections: [string, string][] }) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">RENOVA</div>
      <h1 className="mt-2 text-3xl font-black">{title}</h1>
      <div className="mt-6 space-y-5">
        {sections.map(([heading, body]) => (
          <section key={heading} className="rounded-xl border border-border bg-card p-5">
            <h2 className="font-black">{heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
