import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/returns")({
  head: () => ({ meta: [{ title: "Devoluciones - RENOVA" }] }),
  component: ReturnsPage,
});

function ReturnsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">RENOVA</div>
      <h1 className="mt-2 text-3xl font-black">Politica de devoluciones</h1>
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
        Las devoluciones se gestionan por pedido y quedan sujetas al estado logistico, factura, metodo de pago y revision operativa. El administrador puede dar seguimiento desde pedidos, facturacion, soporte y SAP Middleware.
      </div>
    </div>
  );
}
