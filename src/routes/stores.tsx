import { createFileRoute } from "@tanstack/react-router";
import { MapPin, Phone, Clock } from "lucide-react";
import { getStores } from "@/lib/catalog";

export const Route = createFileRoute("/stores")({
  loader: async () => ({ stores: await getStores() }),
  head: () => ({
    meta: [
      { title: "Nuestras tiendas — RENOVA" },
      { name: "description", content: "Encuentra la tienda RENOVA más cercana. Disponemos de sucursales en Guatemala, Mixco, Quetzaltenango y Antigua." },
    ],
  }),
  component: StoresPage,
});

function StoresPage() {
  const { stores } = Route.useLoaderData();

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl md:text-4xl font-black">Nuestras tiendas</h1>
      <p className="text-muted-foreground mt-1">Visítanos o retira tus pedidos en cualquiera de nuestras sucursales.</p>

      <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((s) => (
          <div key={s.id} className="bg-card border border-border rounded-xl p-6 hover:shadow-[var(--shadow-card-hover)] transition-shadow">
            <div className="h-32 -mx-6 -mt-6 mb-4 rounded-t-xl bg-gradient-to-br from-secondary to-primary" />
            <h3 className="font-bold text-lg">{s.name}</h3>
            <p className="text-sm text-muted-foreground">{s.city}</p>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" /> {s.address}</div>
              <div className="flex gap-2"><Phone className="h-4 w-4 mt-0.5 text-primary shrink-0" /> {s.phone}</div>
              <div className="flex gap-2"><Clock className="h-4 w-4 mt-0.5 text-primary shrink-0" /> {s.hours}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
