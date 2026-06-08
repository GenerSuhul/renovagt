import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacidad - RENOVA" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">RENOVA</div>
      <h1 className="mt-2 text-3xl font-black">Politica de privacidad</h1>
      <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
        Usamos tu informacion para autenticarte, procesar pedidos, gestionar entregas, emitir documentos fiscales y darte soporte. Los datos operativos se almacenan en Supabase y las integraciones externas deben viajar mediante eventos auditables e idempotentes.
      </div>
    </div>
  );
}
