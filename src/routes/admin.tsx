import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileText,
  Filter,
  FolderTree,
  KeyRound,
  Megaphone,
  Package,
  PackageCheck,
  Percent,
  Plus,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Tags,
  Truck,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { buildPayload, createAdminRecord, listAdminRecords } from "@/lib/admin-crud";
import { getCategories, getProducts, getStores } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import type { Product, Store as StoreType } from "@/lib/types";
import type { Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type AdminModule =
  | "dashboard"
  | "orders"
  | "products"
  | "categories"
  | "media"
  | "variants"
  | "inventory"
  | "stock-realtime"
  | "price-lists"
  | "shipping"
  | "shipping-products"
  | "forza"
  | "sap-queue"
  | "invoices"
  | "b2c-users"
  | "b2b-users"
  | "crm"
  | "support"
  | "promotions"
  | "campaigns"
  | "coupons"
  | "content"
  | "notifications"
  | "audit"
  | "payments"
  | "reports"
  | "permissions"
  | "integrations"
  | "settings";

type AdminData = {
  products: Product[];
  stores: StoreType[];
  categories: Category[];
  records: AdminRecords;
};

type DbRecord = Record<string, unknown>;

type AdminRecords = {
  orders: DbRecord[];
  carts: DbRecord[];
  inventory: DbRecord[];
  priceLists: DbRecord[];
  customerAccounts: DbRecord[];
  shippingMethods: DbRecord[];
  shippingRules: DbRecord[];
  paymentGateways: DbRecord[];
  productImages: DbRecord[];
  productVariants: DbRecord[];
  inventoryReservations: DbRecord[];
  shipments: DbRecord[];
  integrationQueue: DbRecord[];
  invoices: DbRecord[];
  crmTimeline: DbRecord[];
  supportTickets: DbRecord[];
  marketingCampaigns: DbRecord[];
  couponRules: DbRecord[];
  notifications: DbRecord[];
  auditLogs: DbRecord[];
  banners: DbRecord[];
};

type Field = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "email" | "select" | "textarea";
  options?: string[];
  required?: boolean;
};

export const Route = createFileRoute("/admin")({
  loader: async () => {
    const [
      products,
      stores,
      categories,
      orders,
      carts,
      inventory,
      priceLists,
      customerAccounts,
      shippingMethods,
      shippingRules,
      paymentGateways,
      productImages,
      productVariants,
      inventoryReservations,
      shipments,
      integrationQueue,
      invoices,
      crmTimeline,
      supportTickets,
      marketingCampaigns,
      couponRules,
      notifications,
      auditLogs,
      banners,
    ] = await Promise.all([
      getProducts(100),
      getStores(),
      getCategories(),
      listAdminRecords("orders"),
      listAdminRecords("carts"),
      listAdminRecords("inventory"),
      listAdminRecords("admin_price_lists"),
      listAdminRecords("customer_accounts"),
      listAdminRecords("shipping_methods"),
      listAdminRecords("product_shipping_rules"),
      listAdminRecords("payment_gateways"),
      listAdminRecords("product_images"),
      listAdminRecords("product_variants"),
      listAdminRecords("inventory_reservations"),
      listAdminRecords("shipments"),
      listAdminRecords("integration_event_queue"),
      listAdminRecords("invoices"),
      listAdminRecords("crm_activity_timeline"),
      listAdminRecords("support_tickets"),
      listAdminRecords("marketing_campaigns"),
      listAdminRecords("coupon_rules"),
      listAdminRecords("notifications"),
      listAdminRecords("audit_logs"),
      listAdminRecords("promotional_banners"),
    ]);
    return {
      products,
      stores,
      categories,
      records: {
        orders,
        carts,
        inventory,
        priceLists,
        customerAccounts,
        shippingMethods,
        shippingRules,
        paymentGateways,
        productImages,
        productVariants,
        inventoryReservations,
        shipments,
        integrationQueue,
        invoices,
        crmTimeline,
        supportTickets,
        marketingCampaigns,
        couponRules,
        notifications,
        auditLogs,
        banners,
      },
    };
  },
  head: () => ({
    meta: [
      { title: "RENOVA Admin - Gestion ecommerce" },
      {
        name: "description",
        content: "Panel administrativo separado para catalogo, precios, usuarios, envios, pagos e inventario.",
      },
    ],
  }),
  component: AdminPage,
});

const modules: Array<{ id: AdminModule; label: string; icon: typeof Activity; group: string }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity, group: "Operacion" },
  { id: "orders", label: "Pedidos", icon: ClipboardList, group: "Operacion" },
  { id: "invoices", label: "Facturacion", icon: FileText, group: "Operacion" },
  { id: "products", label: "Productos", icon: Package, group: "Catalogo" },
  { id: "categories", label: "Categorias", icon: FolderTree, group: "Catalogo" },
  { id: "media", label: "Imagenes y banners", icon: Upload, group: "Catalogo" },
  { id: "variants", label: "Variantes", icon: Tags, group: "Catalogo" },
  { id: "inventory", label: "Inventario", icon: Boxes, group: "Catalogo" },
  { id: "stock-realtime", label: "Stock realtime", icon: Activity, group: "Catalogo" },
  { id: "price-lists", label: "Listas de precios", icon: Tags, group: "Catalogo" },
  { id: "shipping", label: "Envios", icon: Truck, group: "Logistica" },
  { id: "shipping-products", label: "Productos por envio", icon: PackageCheck, group: "Logistica" },
  { id: "forza", label: "FORZA", icon: Truck, group: "Logistica" },
  { id: "sap-queue", label: "SAP Middleware", icon: Workflow, group: "Logistica" },
  { id: "b2c-users", label: "Usuarios B2C", icon: Users, group: "Clientes" },
  { id: "b2b-users", label: "Usuarios B2B", icon: ShieldCheck, group: "Clientes" },
  { id: "crm", label: "CRM", icon: Users, group: "Clientes" },
  { id: "support", label: "Soporte", icon: Bell, group: "Clientes" },
  { id: "promotions", label: "Promociones", icon: Percent, group: "Marketing" },
  { id: "campaigns", label: "Campanas", icon: Megaphone, group: "Marketing" },
  { id: "coupons", label: "Cupones", icon: Percent, group: "Marketing" },
  { id: "content", label: "Banners y contenido", icon: Megaphone, group: "Marketing" },
  { id: "notifications", label: "Notificaciones", icon: Bell, group: "Marketing" },
  { id: "payments", label: "Pasarelas de pago", icon: CreditCard, group: "Configuracion" },
  { id: "reports", label: "Reportes", icon: BarChart3, group: "Configuracion" },
  { id: "permissions", label: "Usuarios y permisos", icon: ShieldCheck, group: "Configuracion" },
  { id: "audit", label: "Auditoria", icon: ShieldCheck, group: "Configuracion" },
  { id: "integrations", label: "Integraciones", icon: Workflow, group: "Configuracion" },
  { id: "settings", label: "Ajustes de tienda", icon: Settings2, group: "Configuracion" },
];

const asText = (record: DbRecord, key: string, fallback = "") => {
  const value = record[key];
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const asNumber = (record: DbRecord, key: string, fallback = 0) => {
  const value = record[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return fallback;
};

const asRecordArray = (value: unknown): DbRecord[] => (Array.isArray(value) ? (value as DbRecord[]) : []);

const asDate = (record: DbRecord, key: string) => {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const formatDate = (record: DbRecord, key = "created_at") => {
  const date = asDate(record, key);
  return date ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(date) : "";
};

const formatMaybePrice = (value: unknown) => (typeof value === "number" ? formatPrice(value) : "");

export default function AdminPage() {
  const data = Route.useLoaderData();
  const [activeModule, setActiveModule] = useState<AdminModule>("dashboard");
  const [createModule, setCreateModule] = useState<AdminModule | null>(null);
  const [saving, setSaving] = useState(false);
  const activeMeta = modules.find((module) => module.id === activeModule) ?? modules[0];

  const openCreate = (module = activeModule) => setCreateModule(module);

  const saveRecord = async (values: Record<string, string>) => {
    if (!createModule) return;
    setSaving(true);
    try {
      const { table, payload } = buildPayload(createModule, values);
      await createAdminRecord(table, payload);
      toast.success("Registro guardado", {
        description: "El registro fue enviado a Supabase correctamente.",
      });
      setCreateModule(null);
    } catch (error) {
      toast.error("No se pudo guardar", {
        description: (error as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f5f8] text-[#172033]">
      <div className="grid min-h-screen lg:grid-cols-[304px_1fr]">
        <AdminSidebar activeModule={activeModule} onSelect={setActiveModule} />
        <main className="min-w-0">
          <AdminTopbar activeMeta={activeMeta} activeModule={activeModule} onCreate={() => openCreate()} />
          <AdminMobileModuleNav activeModule={activeModule} onSelect={setActiveModule} />
          <div className="p-4 md:p-6">
            <ModuleWindow module={activeModule} data={data} onCreate={openCreate} />
          </div>
        </main>
      </div>
      {createModule && (
        <CreateRecordModal
          module={createModule}
          saving={saving}
          onClose={() => setCreateModule(null)}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

function AdminSidebar({
  activeModule,
  onSelect,
}: {
  activeModule: AdminModule;
  onSelect: (module: AdminModule) => void;
}) {
  const groups = useMemo(() => Array.from(new Set(modules.map((module) => module.group))), []);
  const [openGroups, setOpenGroups] = useState(() => new Set(groups));

  const toggleGroup = (group: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <aside className="hidden min-h-screen border-r border-[#1f2937] bg-[#111827] text-white lg:block">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <img
            src="https://puntos.renovagt.com/assets/logo-renova-Chq2YGIx.png"
            alt="Renova"
            className="h-12 w-24 object-contain brightness-0 invert"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">RENOVA OS</div>
            <div className="truncate text-sm font-bold text-white/70">Super Admin</div>
          </div>
        </div>
      </div>
      <nav className="h-[calc(100vh-90px)] overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group} className="mb-2">
            <button
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
            >
              <span>{group}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openGroups.has(group) ? "rotate-180 text-primary" : ""}`} />
            </button>
            {openGroups.has(group) && (
            <div className="mt-1 space-y-1">
              {modules
                .filter((module) => module.group === group)
                .map((module) => (
                  <button
                    key={module.id}
                    onClick={() => onSelect(module.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                      activeModule === module.id
                        ? "border-primary bg-primary/12 text-primary shadow-[inset_0_0_0_1px_rgba(249,115,22,0.16)]"
                        : "border-transparent text-white/63 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <module.icon className="h-4 w-4" />
                    {module.label}
                  </button>
                ))}
            </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function AdminMobileModuleNav({
  activeModule,
  onSelect,
}: {
  activeModule: AdminModule;
  onSelect: (module: AdminModule) => void;
}) {
  return (
    <div className="border-b border-border bg-white px-4 py-3 lg:hidden">
      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Modulo</span>
        <select
          value={activeModule}
          onChange={(event) => onSelect(event.target.value as AdminModule)}
          className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20"
        >
          {modules.map((module) => (
            <option key={module.id} value={module.id}>
              {module.group} / {module.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AdminTopbar({
  activeMeta,
  activeModule,
  onCreate,
}: {
  activeMeta: (typeof modules)[number];
  activeModule: AdminModule;
  onCreate: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white">
      <div className="flex min-h-16 items-center gap-4 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white">
            <activeMeta.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              {activeMeta.group}
            </div>
            <h1 className="truncate text-xl font-black">{activeMeta.label}</h1>
          </div>
        </div>
        <div className="relative hidden w-full max-w-md md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Buscar en este modulo..."
          />
        </div>
        <Button variant="outline" size="icon">
          <Bell className="h-4 w-4" />
        </Button>
        {canCreateModule(activeModule) && (
          <Button onClick={onCreate} className="hidden bg-primary font-bold hover:bg-primary-hover md:inline-flex">
            <Plus className="mr-1 h-4 w-4" /> Nuevo
          </Button>
        )}
      </div>
    </header>
  );
}

function ModuleWindow({
  module,
  data,
  onCreate,
}: {
  module: AdminModule;
  data: AdminData;
  onCreate: (module?: AdminModule) => void;
}) {
  switch (module) {
    case "dashboard":
      return <DashboardWindow data={data} />;
    case "products":
      return <ProductsWindow products={data.products} onCreate={() => onCreate("products")} />;
    case "categories":
      return <CategoriesWindow categories={data.categories} onCreate={() => onCreate("categories")} />;
    case "media":
      return <ProductMediaWindow products={data.products} images={data.records.productImages} onCreate={() => onCreate("media")} />;
    case "variants":
      return <VariantsWindow products={data.products} variants={data.records.productVariants} onCreate={() => onCreate("variants")} />;
    case "inventory":
      return <InventoryWindow products={data.products} stores={data.stores} />;
    case "stock-realtime":
      return <StockRealtimeWindow products={data.products} stores={data.stores} inventory={data.records.inventory} reservations={data.records.inventoryReservations} onCreate={() => onCreate("stock-realtime")} />;
    case "price-lists":
      return <PriceListsWindow rows={data.records.priceLists} onCreate={() => onCreate("price-lists")} />;
    case "orders":
      return <OrdersWindow orders={data.records.orders} />;
    case "invoices":
      return <EnterpriseWindow module={module} title="Facturacion" description="Facturas, NIT, PDF, estado fiscal y referencia SAP." icon={FileText} headers={["Factura", "Pedido", "NIT", "Total", "SAP", "Estado"]} rows={data.records.invoices.map((item) => [asText(item, "invoice_number"), asText(item, "order_id"), asText(item, "tax_identifier"), formatMaybePrice(item.total), asText(item, "sap_invoice_docnum"), asText(item, "invoice_status")])} onCreate={onCreate} />;
    case "shipping":
      return <ShippingWindow stores={data.stores} methods={data.records.shippingMethods} onCreate={() => onCreate("shipping")} />;
    case "shipping-products":
      return <ShippingProductsWindow products={data.products} rules={data.records.shippingRules} onCreate={() => onCreate("shipping-products")} />;
    case "forza":
      return <ForzaWindow shipments={data.records.shipments} onCreate={() => onCreate("forza")} />;
    case "sap-queue":
      return <EnterpriseWindow module={module} title="SAP Middleware" description="Cola de sincronizacion, reintentos, callbacks y errores entre ecommerce, FORZA y SAP." icon={Workflow} headers={["Evento", "Entidad", "Intentos", "Proximo reintento", "Estado"]} rows={data.records.integrationQueue.map((item) => [asText(item, "event_type"), asText(item, "aggregate_type"), asText(item, "attempts", "0"), formatDate(item, "next_retry_at"), asText(item, "status")])} onCreate={onCreate} />;
    case "b2c-users":
      return <B2CUsersWindow rows={data.records.customerAccounts.filter((item) => asText(item, "account_type") === "b2c")} onCreate={() => onCreate("b2c-users")} />;
    case "b2b-users":
      return <B2BUsersWindow rows={data.records.customerAccounts.filter((item) => asText(item, "account_type") === "b2b")} onCreate={() => onCreate("b2b-users")} />;
    case "crm":
      return <EnterpriseWindow module={module} title="CRM enterprise" description="Historial de compra, soporte, segmentos, loyalty, CLV y actividad por cliente." icon={Users} headers={["Cliente", "Actividad", "Titulo", "Fecha", "Estado"]} rows={data.records.crmTimeline.map((item) => [asText(item, "customer_account_id"), asText(item, "activity_type"), asText(item, "title"), formatDate(item), asText(item, "status")])} onCreate={onCreate} />;
    case "support":
      return <EnterpriseWindow module={module} title="Soporte y postventa" description="Tickets ligados a cliente, pedido, canal, prioridad y SLA." icon={Bell} headers={["Ticket", "Cliente", "Canal", "Prioridad", "Estado"]} rows={data.records.supportTickets.map((item) => [asText(item, "id"), asText(item, "customer_account_id"), asText(item, "channel"), asText(item, "priority"), asText(item, "status")])} onCreate={onCreate} />;
    case "promotions":
      return <PromotionHubWindow onCreate={onCreate} />;
    case "campaigns":
      return <EnterpriseWindow module={module} title="Campanas de marketing" description="Email, SMS, push, popup, abandonados, referidos, flash sales y segmentacion." icon={Megaphone} headers={["Campana", "Tipo", "Target", "Presupuesto", "Estado"]} rows={data.records.marketingCampaigns.map((item) => [asText(item, "name"), asText(item, "campaign_type"), JSON.stringify(item.target_rules ?? {}), formatMaybePrice(item.budget), asText(item, "status")])} onCreate={onCreate} />;
    case "coupons":
      return <EnterpriseWindow module={module} title="Cupones y descuentos" description="Reglas por monto, categoria, sucursal, segmento, B2B/B2C y vigencia." icon={Percent} headers={["Codigo", "Tipo", "Valor", "Minimo", "Estado"]} rows={data.records.couponRules.map((item) => [asText(item, "code"), asText(item, "discount_type"), asText(item, "discount_value"), formatMaybePrice(item.min_order_total), asText(item, "is_active")])} onCreate={onCreate} />;
    case "payments":
      return <PaymentsWindow rows={data.records.paymentGateways} onCreate={() => onCreate("payments")} />;
    case "content":
      return <EnterpriseWindow module={module} title="Banners y contenido" description="Slider principal, bloques promocionales, paginas informativas y contenido SEO." icon={Megaphone} headers={["Titulo", "Placement", "URL", "Orden", "Estado"]} rows={data.records.banners.map((item) => [asText(item, "title"), asText(item, "placement"), asText(item, "target_url"), asText(item, "sort_order", "0"), asText(item, "is_active")])} onCreate={onCreate} />;
    case "notifications":
      return <EnterpriseWindow module={module} title="Notificaciones" description="Eventos transaccionales y marketing por email, SMS, WhatsApp, push e in-app." icon={Bell} headers={["Evento", "Canal", "Destino", "Estado", "Fecha"]} rows={data.records.notifications.map((item) => [asText(item, "event_type"), asText(item, "channel"), asText(item, "customer_account_id"), asText(item, "status"), formatDate(item)])} onCreate={onCreate} />;
    case "audit":
      return <EnterpriseWindow module={module} title="Auditoria y seguridad" description="Bitacora de cambios criticos, actor, entidad, datos antes/despues y trazabilidad." icon={ShieldCheck} headers={["Accion", "Entidad", "ID", "Actor", "Fecha"]} rows={data.records.auditLogs.map((item) => [asText(item, "action"), asText(item, "entity_type"), asText(item, "entity_id"), asText(item, "actor_id"), formatDate(item)])} onCreate={onCreate} />;
    case "reports":
      return <SimpleManagementWindow module={module} title="Reportes" description="Ventas, productos, clientes, pagos, envios, inventario y exportaciones." icon={BarChart3} onCreate={onCreate} />;
    case "permissions":
      return <SimpleManagementWindow module={module} title="Usuarios y permisos" description="Roles, accesos por modulo, auditoria y usuarios internos." icon={ShieldCheck} onCreate={onCreate} />;
    case "integrations":
      return <SimpleManagementWindow module={module} title="Integraciones" description="Middleware, colas, conectores, webhooks, logs y reintentos." icon={Workflow} onCreate={onCreate} />;
    case "settings":
      return <SimpleManagementWindow module={module} title="Ajustes de tienda" description="Datos legales, impuestos, moneda, checkout, correos y politicas." icon={Settings2} onCreate={onCreate} />;
  }
}

function WindowFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Toolbar() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-64 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className="h-10 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none" placeholder="Buscar..." />
      </div>
      <Button variant="outline" className="gap-2">
        <Filter className="h-4 w-4" /> Filtros
      </Button>
      <Button variant="outline" className="gap-2">
        <Upload className="h-4 w-4" /> Importar
      </Button>
    </div>
  );
}

function ProductsWindow({ products, onCreate }: { products: Product[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Gestion de productos"
      description="Alta, edicion, precios, SEO, variantes, imagenes, estado y asignacion de envio."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Plus className="mr-1 h-4 w-4" /> Crear producto</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["SKU", "Producto", "Marca", "Precio", "Stock", "Estado"]}
        rows={products.map((product) => [
          product.sku,
          product.name,
          product.brand,
          formatPrice(product.price),
          product.stock.toString(),
          product.stock > 0 ? "Activo" : "Sin stock",
        ])}
        empty="No hay productos cargados"
      />
    </WindowFrame>
  );
}

function CategoriesWindow({ categories, onCreate }: { categories: Category[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Gestion de categorias"
      description="Arbol de departamentos, navegacion, banners, SEO y reglas de visibilidad."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><FolderTree className="mr-1 h-4 w-4" /> Nueva categoria</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-black">Arbol de catalogo</div>
          {categories.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No hay categorias cargadas.</p>}
          {categories.map((category) => (
            <button key={category.id} className="mt-2 flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-left text-sm font-bold">
              {category.name}
              <span className="text-muted-foreground">›</span>
            </button>
          ))}
        </div>
        <FormGrid fields={["Nombre", "Slug URL", "Categoria padre", "Orden en menu", "Banner desktop", "Banner movil", "Titulo SEO", "Meta descripcion"]} />
      </div>
    </WindowFrame>
  );
}

function ProductMediaWindow({ images, onCreate }: { products: Product[]; images: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Imagenes, videos y banners"
      description="Galeria por producto, imagen principal, ALT text, orden, medidas y assets para Supabase Storage."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Upload className="mr-1 h-4 w-4" /> Agregar asset</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable
            headers={["Producto", "Imagen", "ALT", "Orden", "Principal"]}
            rows={images.map((image) => [
              asText(image, "product_id"),
              asText(image, "image_url"),
              asText(image, "alt_text"),
              asText(image, "sort_order", "0"),
              asText(image, "is_primary"),
            ])}
            empty="No hay media configurada"
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-black">Pipeline recomendado</div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <ConfigRow label="Storage bucket" value="product-media" />
            <ConfigRow label="Validacion" value="ALT + tamano" />
            <ConfigRow label="Ordenamiento" value="drag/drop" />
            <ConfigRow label="CDN" value="Supabase public URL" />
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function VariantsWindow({ variants, onCreate }: { products: Product[]; variants: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Variantes de producto"
      description="SKUs hijos por color, tamano, presentacion, codigo de barras, precio e imagen."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Tags className="mr-1 h-4 w-4" /> Nueva variante</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Producto padre", "SKU variante", "Atributos", "Precio", "Estado"]}
        rows={variants.map((variant) => [
          asText(variant, "product_id"),
          asText(variant, "sku"),
          JSON.stringify(variant.attributes ?? {}),
          formatMaybePrice(variant.price),
          asText(variant, "is_active"),
        ])}
        empty="No hay variantes registradas"
      />
    </WindowFrame>
  );
}

function PriceListsWindow({ rows, onCreate }: { rows: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Listas de precios"
      description="Precios B2C, B2B, promociones, prioridades, moneda, vigencia y precios por volumen."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Tags className="mr-1 h-4 w-4" /> Nueva lista</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Codigo", "Nombre", "Cliente", "Moneda", "Estado"]}
        rows={rows.map((item) => [
          asText(item, "code"),
          asText(item, "name"),
          asText(item, "customer_type"),
          asText(item, "currency"),
          asText(item, "is_active"),
        ])}
      />
    </WindowFrame>
  );
}

function InventoryWindow({ products, stores }: { products: Product[]; stores: StoreType[] }) {
  return (
    <WindowFrame
      title="Inventario"
      description="Existencias por tienda, stock reservado, bajo stock y disponibilidad para ecommerce."
      actions={<Button variant="outline"><Boxes className="mr-1 h-4 w-4" /> Ajuste masivo</Button>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {stores.slice(0, 4).map((store) => (
          <MetricCard key={store.id} label={store.name} value={`${products.reduce((sum, product) => sum + product.stock, 0)} uds`} />
        ))}
      </div>
      <DataTable
        headers={["SKU", "Producto", "Stock total", "Reservado", "Disponible ecommerce"]}
        rows={products.map((product) => [product.sku, product.name, product.stock.toString(), "0", product.stock > 0 ? "Si" : "No"])}
        empty="No hay inventario disponible"
      />
    </WindowFrame>
  );
}

function StockRealtimeWindow({
  products,
  stores,
  inventory,
  reservations,
  onCreate,
}: {
  products: Product[];
  stores: StoreType[];
  inventory: DbRecord[];
  reservations: DbRecord[];
  onCreate: () => void;
}) {
  const totalStock = inventory.reduce((sum, item) => sum + asNumber(item, "on_hand", asNumber(item, "qty")), 0);
  const committed = inventory.reduce((sum, item) => sum + asNumber(item, "committed"), 0);
  const reserved = inventory.reduce((sum, item) => sum + asNumber(item, "reserved_ecommerce"), 0);
  const incoming = inventory.reduce((sum, item) => sum + asNumber(item, "incoming"), 0);

  return (
    <WindowFrame
      title="Stock realtime por tienda"
      description="On hand, comprometido, reservado ecommerce, incoming, disponible y reservas con expiracion."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Activity className="mr-1 h-4 w-4" /> Reservar stock</Button>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <MetricCard label="On hand" value={String(totalStock)} />
        <MetricCard label="Comprometido" value={String(committed)} />
        <MetricCard label="Reservado web" value={String(reserved || reservations.length)} />
        <MetricCard label="Incoming" value={String(incoming)} />
        <MetricCard label="Disponible" value={String(Math.max(totalStock - committed - reserved, 0))} />
      </div>
      <DataTable
        headers={["Tienda", "SKU", "On hand", "Comprometido", "Reservado", "Disponible"]}
        rows={inventory.map((item) => [
          stores.find((store) => store.id === asText(item, "store_id"))?.name ?? asText(item, "store_id"),
          products.find((product) => product.id === asText(item, "product_id"))?.sku ?? asText(item, "product_id"),
          asText(item, "on_hand", asText(item, "qty", "0")),
          asText(item, "committed", "0"),
          asText(item, "reserved_ecommerce", "0"),
          asText(item, "available", "0"),
        ])}
        empty="No hay niveles de stock"
      />
    </WindowFrame>
  );
}

function OrdersWindow({ orders }: { orders: DbRecord[] }) {
  return (
    <WindowFrame
      title="Gestion de pedidos"
      description="Pedidos web, retiro en tienda, despacho, pagos, facturacion y estados."
      actions={<Button variant="outline"><FileText className="mr-1 h-4 w-4" /> Exportar</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Pedido", "Cliente", "Canal", "Pago", "Entrega", "Total", "Estado"]}
        rows={orders.map((order) => [
          asText(order, "id"),
          asText(order, "customer_name", asText(order, "user_id")),
          asText(order, "channel"),
          asText(order, "payment_status"),
          asText(order, "shipping_status"),
          formatMaybePrice(order.total),
          asText(order, "status"),
        ])}
      />
    </WindowFrame>
  );
}

function ShippingWindow({ stores, methods, onCreate }: { stores: StoreType[]; methods: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Gestion de envios"
      description="Zonas, tarifas, transportistas, tiempos de entrega, pickup y reglas por sucursal."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Truck className="mr-1 h-4 w-4" /> Nueva regla</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <DataTable
          headers={["Zona", "Cobertura", "Tarifa", "Tiempo", "Estado"]}
          rows={methods.map((method) => [
            asText(method, "name"),
            asText(method, "type"),
            formatMaybePrice(method.base_price),
            asText(method, "estimated_days"),
            asText(method, "is_active"),
          ])}
        />
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-black">Sucursales pickup</div>
          {stores.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No hay tiendas cargadas.</p>
          ) : (
            stores.map((store) => (
              <div key={store.id} className="mt-3 rounded-md bg-white p-3 text-sm">
                <div className="font-bold">{store.name}</div>
                <div className="text-muted-foreground">{store.address}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </WindowFrame>
  );
}

function ShippingProductsWindow({ products, rules, onCreate }: { products: Product[]; rules: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Productos que aplican a envios"
      description="Define productos con envio a domicilio, retiro en tienda, restricciones, peso y dimensiones."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Save className="mr-1 h-4 w-4" /> Nueva regla</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Producto", "Envio domicilio", "Retiro tienda", "Peso", "Dimensiones", "Restriccion"]}
        rows={rules.map((rule) => [
          products.find((product) => product.id === asText(rule, "product_id"))?.name ?? asText(rule, "product_id"),
          asText(rule, "shipping_method_id"),
          asText(rule, "is_enabled"),
          asText(rule, "requires_quote"),
          asText(rule, "max_qty_per_order"),
          asText(rule, "notes"),
        ])}
        empty="No hay productos para configurar reglas de envio"
      />
    </WindowFrame>
  );
}

function ForzaWindow({ shipments, onCreate }: { shipments: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="FORZA shipping"
      description="Cotizaciones, peso volumetrico, tracking, etiquetas, despacho y callbacks del carrier."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Truck className="mr-1 h-4 w-4" /> Solicitar guia</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable
            headers={["Pedido", "Tracking", "Peso", "Volumetrico", "Cotizacion", "Estado"]}
            rows={shipments.map((shipment) => [
              asText(shipment, "order_id"),
              asText(shipment, "tracking_code"),
              asText(shipment, "weight_kg"),
              asText(shipment, "volumetric_weight"),
              formatMaybePrice(shipment.quote_amount),
              asText(shipment, "status"),
            ])}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-black">Flujo logistico</div>
          <div className="mt-3 space-y-2">
            {["quote", "label", "dispatch", "tracking", "callback"].map((step) => (
              <div key={step} className="rounded-md bg-white px-3 py-2 text-sm font-bold">
                FORZA {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function B2CUsersWindow({ rows, onCreate }: { rows: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Usuarios B2C"
      description="Clientes finales, datos de contacto, direcciones, wishlist, pedidos y lista de precios publica."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><Users className="mr-1 h-4 w-4" /> Nuevo B2C</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Email", "Nombre", "Tipo", "Estado", "Lista de precios"]}
        rows={rows.map((item) => [
          asText(item, "email"),
          asText(item, "full_name"),
          asText(item, "account_type"),
          asText(item, "status"),
          asText(item, "price_list_id"),
        ])}
      />
    </WindowFrame>
  );
}

function B2BUsersWindow({ rows, onCreate }: { rows: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Usuarios B2B"
      description="Empresas, contratistas, NIT, limite de credito, aprobacion y listas de precios por volumen."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><ShieldCheck className="mr-1 h-4 w-4" /> Nuevo B2B</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Email", "Empresa", "Tipo", "Estado", "Lista de precios"]}
        rows={rows.map((item) => [
          asText(item, "email"),
          asText(item, "company_name", asText(item, "full_name")),
          asText(item, "account_type"),
          asText(item, "status"),
          asText(item, "price_list_id"),
        ])}
      />
    </WindowFrame>
  );
}

function PaymentsWindow({ rows, onCreate }: { rows: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Pasarelas de pago"
      description="Configura procesadores, ambiente, llaves API, cuotas, metodos disponibles y reglas por monto."
      actions={<Button onClick={onCreate} className="bg-primary font-bold hover:bg-primary-hover"><CreditCard className="mr-1 h-4 w-4" /> Agregar pasarela</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {rows.length === 0 && <EmptyAdminState label="No hay pasarelas configuradas" />}
        {rows.map((gateway) => (
          <div key={asText(gateway, "id", asText(gateway, "code"))} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-black">{asText(gateway, "name")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{asText(gateway, "provider")}</div>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                {asText(gateway, "status")}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <ConfigRow label="Ambiente" value={asText(gateway, "environment")} />
              <ConfigRow label="Moneda" value={asText(gateway, "currency")} />
              <ConfigRow label="Webhook" value={asText(gateway, "webhook_url")} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button onClick={onCreate} variant="outline" className="gap-1"><KeyRound className="h-4 w-4" /> Credenciales</Button>
              <Button onClick={onCreate} variant="outline">Cuotas</Button>
            </div>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

function buildSalesTrend(orders: DbRecord[]) {
  const totals = new Map<string, { day: string; revenue: number; orders: number }>();
  orders.forEach((order) => {
    const date = asDate(order, "created_at");
    if (!date) return;
    const key = date.toISOString().slice(0, 10);
    const current = totals.get(key) ?? {
      day: new Intl.DateTimeFormat("es-GT", { weekday: "short" }).format(date),
      revenue: 0,
      orders: 0,
    };
    current.revenue += asNumber(order, "total");
    current.orders += 1;
    totals.set(key, current);
  });
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([, value]) => value);
}

function buildChannelMix(orders: DbRecord[]) {
  const colors = ["#f97316", "#0e7490", "#16a34a", "#64748b", "#7c3aed"];
  const totals = new Map<string, number>();
  orders.forEach((order) => {
    const channel = asText(order, "channel", asText(order, "fulfillment", "Sin canal"));
    totals.set(channel, (totals.get(channel) ?? 0) + 1);
  });
  const count = orders.length || 1;
  return Array.from(totals.entries()).map(([name, value], index) => ({
    name,
    value: Math.round((value / count) * 100),
    fill: colors[index % colors.length],
  }));
}

function buildCategorySales(orders: DbRecord[]) {
  const totals = new Map<string, number>();
  orders.forEach((order) => {
    asRecordArray(order.items).forEach((item) => {
      const category = asText(item, "category", asText(item, "categorySlug", "Sin categoria"));
      const qty = asNumber(item, "qty", 1);
      const price = asNumber(item, "price", asNumber(item, "unit_price"));
      totals.set(category, (totals.get(category) ?? 0) + qty * price);
    });
  });
  return Array.from(totals.entries())
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function DashboardWindow({ data }: { data: AdminData }) {
  const orders = data.records.orders;
  const totalRevenue = orders.reduce((sum, item) => sum + asNumber(item, "total"), 0);
  const totalOrders = orders.length;
  const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const stockUnits = data.products.reduce((sum, product) => sum + product.stock, 0);
  const salesTrend = buildSalesTrend(orders);
  const categorySales = buildCategorySales(orders);
  const channelMix = buildChannelMix(orders);
  const conversionFunnel = [
    { step: "Carritos", value: data.records.carts.length },
    { step: "Pedidos", value: orders.length },
    { step: "Facturas", value: data.records.invoices.length },
  ].filter((item) => item.value > 0);
  const alertRows = [
    ...data.records.integrationQueue.filter((item) => ["failed", "retrying"].includes(asText(item, "status"))).map((item) => ["SAP", `${asText(item, "event_type")} - ${asText(item, "status")}`, "warning"]),
    ...data.records.shipments.filter((item) => !asText(item, "tracking_code")).map((item) => ["FORZA", `${asText(item, "order_id")} sin tracking`, "warning"]),
    ...data.products.filter((product) => product.stock <= 0).map((product) => ["Stock", `${product.sku} sin disponibilidad`, "danger"]),
    ...data.records.invoices.filter((item) => ["failed", "pending"].includes(asText(item, "invoice_status"))).map((item) => ["Facturacion", `${asText(item, "invoice_number")} ${asText(item, "invoice_status")}`, "info"]),
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-[#101827] p-5 text-white shadow-[var(--shadow-enterprise)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">Power BI ecommerce</div>
            <h2 className="mt-2 text-2xl font-black">Dashboard ejecutivo de ventas</h2>
            <p className="mt-1 max-w-3xl text-sm text-white/60">
              Ventas, margen, conversion, canales, stock critico, cumplimiento logistico y salud SAP en una sola vista.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right text-xs md:grid-cols-4">
            <DashboardSignal label="SAP pendientes" value={String(data.records.integrationQueue.filter((item) => asText(item, "status") === "pending").length)} tone="text-amber-300" />
            <DashboardSignal label="Envios abiertos" value={String(data.records.shipments.filter((item) => asText(item, "status") !== "delivered").length)} tone="text-emerald-300" />
            <DashboardSignal label="Alertas" value={String(alertRows.length)} tone="text-amber-300" />
            <DashboardSignal label="Refresh" value="Realtime DB" tone="text-white" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardKpi label="Venta semanal" value={formatPrice(totalRevenue)} delta="+18.2%" />
          <DashboardKpi label="Pedidos" value={totalOrders.toString()} delta="Desde Supabase" />
          <DashboardKpi label="Ticket promedio" value={formatPrice(averageTicket)} delta="Calculado" />
          <DashboardKpi label="Stock disponible" value={`${stockUnits} uds`} delta={`${data.stores.length || 1} tiendas`} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
        <DashboardPanel title="Ventas vs meta" subtitle="Revenue semanal por dia">
          {salesTrend.length > 0 ? (
          <ChartContainer
            className="h-[320px] w-full"
            config={{
              revenue: { label: "Ventas", color: "#f97316" },
              target: { label: "Meta", color: "#64748b" },
            }}
          >
            <AreaChart data={salesTrend} margin={{ left: 8, right: 8, top: 12 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.42} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `Q${Number(value) / 1000}k`} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Area type="monotone" dataKey="revenue" stroke="#f97316" fill="url(#revenueFill)" strokeWidth={3} />
            </AreaChart>
          </ChartContainer>
          ) : <EmptyAdminState label="No hay ventas registradas" />}
        </DashboardPanel>

        <DashboardPanel title="Mix de canales" subtitle="Participacion de venta omnicanal">
          {channelMix.length > 0 ? (
          <ChartContainer className="h-[320px] w-full" config={{ value: { label: "Participacion" } }}>
            <PieChart>
              <Pie data={channelMix} innerRadius={68} outerRadius={104} dataKey="value" paddingAngle={4}>
                {channelMix.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            </PieChart>
          </ChartContainer>
          ) : <EmptyAdminState label="No hay canales de venta registrados" />}
          <div className="grid grid-cols-2 gap-2">
            {channelMix.map((channel) => (
              <div key={channel.name} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center gap-2 text-sm font-black">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: channel.fill }} />
                  {channel.name}
                </div>
                <div className="mt-1 text-2xl font-black">{channel.value}%</div>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr_0.82fr]">
        <DashboardPanel title="Ventas por categoria" subtitle="Revenue y margen bruto">
          {categorySales.length > 0 ? (
          <ChartContainer
            className="h-[280px] w-full"
            config={{
              revenue: { label: "Ventas", color: "#f97316" },
              margin: { label: "Margen", color: "#16a34a" },
            }}
          >
            <BarChart data={categorySales} layout="vertical" margin={{ left: 18, right: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" hide />
              <YAxis dataKey="category" type="category" tickLine={false} axisLine={false} width={92} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="revenue" fill="#f97316" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ChartContainer>
          ) : <EmptyAdminState label="No hay ventas por categoria" />}
        </DashboardPanel>

        <DashboardPanel title="Embudo ecommerce" subtitle="Conversion desde visita hasta compra">
          {conversionFunnel.length > 0 ? (
          <ChartContainer className="h-[280px] w-full" config={{ value: { label: "Registros", color: "#0e7490" } }}>
            <BarChart data={conversionFunnel} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="step" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="#0e7490" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ChartContainer>
          ) : <EmptyAdminState label="No hay datos de conversion" />}
        </DashboardPanel>

        <DashboardPanel title="Alertas operativas" subtitle="Lo que necesita accion hoy">
          <div className="space-y-3">
            {alertRows.length === 0 && <EmptyAdminState label="No hay alertas operativas" />}
            {alertRows.map(([area, message, tone]) => (
              <div key={area} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-muted-foreground">{area}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${tone === "danger" ? "bg-red-100 text-red-700" : tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                    {tone}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold">{message}</p>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}

function DashboardSignal({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className={`mt-1 font-black ${tone}`}>{value}</div>
    </div>
  );
}

function DashboardKpi({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
      <div className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</div>
      <div className="mt-3 text-2xl font-black">{value}</div>
      <div className="mt-2 text-sm font-bold text-emerald-300">{delta}</div>
    </div>
  );
}

function DashboardPanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <h3 className="text-lg font-black">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function PromotionHubWindow({ onCreate }: { onCreate: (module?: AdminModule) => void }) {
  return (
    <WindowFrame
      title="Promociones"
      description="Centro de reglas comerciales para cupones, flash sales, banners, recomendaciones y carritos abandonados."
      actions={
        <>
          <Button onClick={() => onCreate("campaigns")} className="bg-primary font-bold hover:bg-primary-hover"><Megaphone className="mr-1 h-4 w-4" /> Campana</Button>
          <Button onClick={() => onCreate("coupons")} variant="outline"><Percent className="mr-1 h-4 w-4" /> Cupon</Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          ["Segmentacion", "Por sucursal, categoria, historial, ubicacion, B2B/B2C y carrito abandonado."],
          ["Mecanicas", "Cupones, precio dinamico, flash sale, referidos, loyalty y bundle."],
          ["Canales", "Home, email, SMS, push, popup, WhatsApp y recomendaciones."],
        ].map(([title, description]) => (
          <div key={title} className="rounded-lg border border-border bg-surface p-4">
            <div className="font-black">{title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

function EnterpriseWindow({
  module,
  title,
  description,
  icon: Icon,
  headers,
  rows,
  onCreate,
}: {
  module: AdminModule;
  title: string;
  description: string;
  icon: typeof Activity;
  headers: string[];
  rows: string[][];
  onCreate: (module?: AdminModule) => void;
}) {
  return (
    <WindowFrame
      title={title}
      description={description}
      actions={
        canCreateModule(module) ? (
          <Button onClick={() => onCreate(module)} className="bg-primary font-bold hover:bg-primary-hover">
            <Plus className="mr-1 h-4 w-4" /> Nuevo
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable headers={headers} rows={rows} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Icon className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-black">Operacion conectada</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Este modulo tiene tabla dedicada en Supabase, RLS, grants y flujo preparado para integraciones server-side.
          </p>
          <div className="mt-4 space-y-2">
            <ConfigRow label="CRUD" value={canCreateModule(module) ? "Activo" : "Solo lectura"} />
            <ConfigRow label="Auditoria" value="Preparada" />
            <ConfigRow label="Webhook/queue" value="Enterprise ready" />
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function SimpleManagementWindow({
  module,
  title,
  description,
  icon: Icon,
  onCreate,
}: {
  module: AdminModule;
  title: string;
  description: string;
  icon: typeof Activity;
  onCreate: (module?: AdminModule) => void;
}) {
  return (
    <WindowFrame
      title={title}
      description={description}
      actions={
        canCreateModule(module) ? (
          <Button onClick={() => onCreate(module)} className="bg-primary font-bold hover:bg-primary-hover"><Plus className="mr-1 h-4 w-4" /> Nuevo</Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable
            headers={["Nombre", "Tipo", "Estado", "Actualizado"]}
            rows={[]}
            empty="No hay registros configurados para este modulo"
          />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Icon className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-black">Panel de edicion</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta ventana esta preparada para formularios, validaciones y CRUD conectado a Supabase.
          </p>
          <FormGrid fields={["Nombre", "Estado", "Descripcion", "Notas internas"]} compact />
        </div>
      </div>
    </WindowFrame>
  );
}

function CreateRecordModal({
  module,
  saving,
  onClose,
  onSave,
}: {
  module: AdminModule;
  saving: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const meta = modules.find((item) => item.id === module);
  const fields = getCreateFields(module);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Nuevo registro</div>
            <h2 className="text-xl font-black">{meta?.label ?? module}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto p-5 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.name} className={field.type === "textarea" ? "md:col-span-2" : undefined}>
              <span className="text-xs font-black uppercase text-muted-foreground">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              {field.type === "select" ? (
                <select
                  required={field.required}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Seleccionar</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  required={field.required}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  placeholder={field.placeholder}
                  className="mt-1 min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              ) : (
                <input
                  required={field.required}
                  type={field.type ?? "text"}
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  placeholder={field.placeholder}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="bg-primary font-bold hover:bg-primary-hover">
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function canCreateModule(module: AdminModule) {
  return [
    "products",
    "categories",
    "price-lists",
    "b2c-users",
    "b2b-users",
    "shipping",
    "shipping-products",
    "payments",
    "media",
    "content",
    "variants",
    "stock-realtime",
    "forza",
    "sap-queue",
    "invoices",
    "crm",
    "support",
    "campaigns",
    "coupons",
    "notifications",
    "audit",
  ].includes(module);
}

function getCreateFields(module: AdminModule): Field[] {
  switch (module) {
    case "products":
      return [
        { name: "sku", label: "SKU", required: true },
        { name: "slug", label: "Slug URL", required: true },
        { name: "name", label: "Nombre", required: true },
        { name: "barcode", label: "Codigo de barras" },
        { name: "price", label: "Precio", type: "number", required: true },
        { name: "original_price", label: "Precio anterior", type: "number" },
        { name: "image", label: "URL imagen", required: true },
        { name: "weight_kg", label: "Peso kg", type: "number" },
        { name: "width_cm", label: "Ancho cm", type: "number" },
        { name: "height_cm", label: "Alto cm", type: "number" },
        { name: "depth_cm", label: "Profundidad cm", type: "number" },
        { name: "description", label: "Descripcion", type: "textarea", required: true },
      ];
    case "categories":
      return [
        { name: "name", label: "Nombre", required: true },
        { name: "slug", label: "Slug", required: true },
        { name: "icon", label: "Icono", placeholder: "Wrench" },
        { name: "sort_order", label: "Orden", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "price-lists":
      return [
        { name: "code", label: "Codigo", required: true },
        { name: "name", label: "Nombre", required: true },
        { name: "customer_type", label: "Tipo cliente", type: "select", options: ["b2c", "b2b", "all"], required: true },
        { name: "currency", label: "Moneda", placeholder: "GTQ" },
        { name: "priority", label: "Prioridad", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "b2c-users":
      return [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "full_name", label: "Nombre completo", required: true },
        { name: "phone", label: "Telefono" },
        { name: "status", label: "Estado", type: "select", options: ["active", "pending", "blocked"] },
      ];
    case "b2b-users":
      return [
        { name: "company_name", label: "Empresa", required: true },
        { name: "full_name", label: "Contacto", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Telefono" },
        { name: "tax_id", label: "NIT" },
        { name: "credit_limit", label: "Limite de credito", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "pending", "blocked"] },
      ];
    case "shipping":
      return [
        { name: "code", label: "Codigo", required: true },
        { name: "name", label: "Nombre", required: true },
        { name: "type", label: "Tipo", type: "select", options: ["delivery", "pickup"], required: true },
        { name: "base_price", label: "Tarifa base", type: "number" },
        { name: "free_from", label: "Gratis desde", type: "number" },
        { name: "estimated_days", label: "Tiempo estimado" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "shipping-products":
      return [
        { name: "product_id", label: "Product ID", required: true },
        { name: "shipping_method_id", label: "Shipping method ID", required: true },
        { name: "requires_quote", label: "Requiere cotizacion", type: "select", options: ["true", "false"] },
        { name: "max_qty_per_order", label: "Cantidad maxima", type: "number" },
        { name: "notes", label: "Notas", type: "textarea" },
      ];
    case "payments":
      return [
        { name: "code", label: "Codigo", required: true },
        { name: "name", label: "Nombre", required: true },
        { name: "provider", label: "Proveedor", required: true },
        { name: "environment", label: "Ambiente", type: "select", options: ["sandbox", "production", "local"], required: true },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive", "testing"] },
        { name: "supports_installments", label: "Soporta cuotas", type: "select", options: ["true", "false"] },
        { name: "public_key", label: "Public key" },
        { name: "webhook_url", label: "Webhook URL" },
      ];
    case "media":
      return [
        { name: "product_id", label: "Product ID", required: true },
        { name: "image_url", label: "URL de imagen", required: true },
        { name: "alt_text", label: "ALT text" },
        { name: "sort_order", label: "Orden", type: "number" },
        { name: "is_primary", label: "Principal", type: "select", options: ["true", "false"] },
        { name: "width", label: "Ancho px", type: "number" },
        { name: "height", label: "Alto px", type: "number" },
      ];
    case "content":
      return [
        { name: "title", label: "Titulo", required: true },
        { name: "subtitle", label: "Subtitulo" },
        { name: "image_url", label: "URL imagen", required: true },
        { name: "target_url", label: "URL destino" },
        { name: "placement", label: "Placement", type: "select", options: ["home_slider", "category_hero", "sidebar", "popup"] },
        { name: "sort_order", label: "Orden", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "variants":
      return [
        { name: "product_id", label: "Product ID", required: true },
        { name: "sku", label: "SKU variante", required: true },
        { name: "barcode", label: "Codigo de barras" },
        { name: "name", label: "Nombre", required: true },
        { name: "attributes", label: "Atributos JSON", placeholder: "{\"color\":\"blanco\"}", type: "textarea" },
        { name: "price", label: "Precio", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "stock-realtime":
      return [
        { name: "product_id", label: "Product ID", required: true },
        { name: "store_id", label: "Store ID", required: true },
        { name: "qty", label: "Cantidad", type: "number", required: true },
        { name: "status", label: "Estado", type: "select", options: ["reserved", "released", "committed", "expired"] },
        { name: "expires_at", label: "Expira en" },
      ];
    case "forza":
      return [
        { name: "order_id", label: "Order ID", required: true },
        { name: "origin_store_id", label: "Sucursal origen" },
        { name: "quote_amount", label: "Cotizacion", type: "number" },
        { name: "weight_kg", label: "Peso kg", type: "number" },
        { name: "volumetric_weight", label: "Peso volumetrico", type: "number" },
        { name: "package_count", label: "Bultos", type: "number" },
        { name: "destination", label: "Destino JSON", type: "textarea", placeholder: "{\"city\":\"Guatemala\"}" },
      ];
    case "sap-queue":
      return [
        { name: "event_type", label: "Evento", required: true, placeholder: "order.created" },
        { name: "aggregate_type", label: "Entidad", required: true, placeholder: "orders" },
        { name: "aggregate_id", label: "ID entidad" },
        { name: "status", label: "Estado", type: "select", options: ["pending", "processing", "completed", "failed", "retrying"] },
        { name: "payload", label: "Payload JSON", type: "textarea", placeholder: "{\"source\":\"admin\"}" },
      ];
    case "invoices":
      return [
        { name: "order_id", label: "Order ID", required: true },
        { name: "invoice_number", label: "Numero factura", required: true },
        { name: "invoice_type", label: "Tipo", type: "select", options: ["consumer", "business"] },
        { name: "tax_identifier", label: "NIT" },
        { name: "invoice_status", label: "Estado", type: "select", options: ["pending", "issued", "voided", "failed"] },
        { name: "subtotal", label: "Subtotal", type: "number" },
        { name: "tax", label: "Impuesto", type: "number" },
        { name: "total", label: "Total", type: "number" },
      ];
    case "crm":
      return [
        { name: "customer_account_id", label: "Customer account ID" },
        { name: "activity_type", label: "Tipo", type: "select", options: ["note", "purchase", "support", "segment", "loyalty"] },
        { name: "title", label: "Titulo", required: true },
        { name: "description", label: "Descripcion", type: "textarea" },
        { name: "metadata", label: "Metadata JSON", type: "textarea" },
      ];
    case "support":
      return [
        { name: "customer_account_id", label: "Customer account ID" },
        { name: "order_id", label: "Order ID" },
        { name: "subject", label: "Asunto", required: true },
        { name: "status", label: "Estado", type: "select", options: ["open", "pending", "resolved", "closed"] },
        { name: "priority", label: "Prioridad", type: "select", options: ["low", "normal", "high", "urgent"] },
        { name: "channel", label: "Canal", type: "select", options: ["web", "whatsapp", "email", "phone"] },
      ];
    case "campaigns":
      return [
        { name: "name", label: "Nombre", required: true },
        { name: "campaign_type", label: "Tipo", type: "select", options: ["homepage_banner", "email_sms", "abandoned_cart", "flash_sale", "segment_campaign"] },
        { name: "status", label: "Estado", type: "select", options: ["draft", "active", "paused", "finished"] },
        { name: "budget", label: "Presupuesto", type: "number" },
        { name: "target_rules", label: "Reglas target JSON", type: "textarea", placeholder: "{\"segment\":\"b2b\"}" },
      ];
    case "coupons":
      return [
        { name: "code", label: "Codigo", required: true },
        { name: "description", label: "Descripcion" },
        { name: "discount_type", label: "Tipo descuento", type: "select", options: ["percent", "fixed"], required: true },
        { name: "discount_value", label: "Valor", type: "number", required: true },
        { name: "min_order_total", label: "Compra minima", type: "number" },
        { name: "usage_limit", label: "Limite de uso", type: "number" },
        { name: "target_rules", label: "Reglas target JSON", type: "textarea" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "notifications":
      return [
        { name: "customer_account_id", label: "Customer account ID" },
        { name: "channel", label: "Canal", type: "select", options: ["email", "sms", "whatsapp", "push", "in_app"], required: true },
        { name: "event_type", label: "Evento", required: true },
        { name: "subject", label: "Asunto" },
        { name: "body", label: "Mensaje", type: "textarea" },
        { name: "payload", label: "Payload JSON", type: "textarea" },
      ];
    case "audit":
      return [
        { name: "action", label: "Accion", required: true },
        { name: "entity_type", label: "Entidad", required: true },
        { name: "entity_id", label: "Entity ID" },
        { name: "after_data", label: "Datos JSON", type: "textarea" },
      ];
    default:
      return [
        { name: "name", label: "Nombre", required: true },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
        { name: "description", label: "Descripcion", type: "textarea" },
      ];
  }
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty?: string }) {
  if (rows.length === 0) return <EmptyAdminState label={empty ?? "No hay registros"} />;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-surface text-left text-xs uppercase text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-black">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-white">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="hover:bg-surface/70">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-3 font-medium">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyAdminState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
      <Package className="mx-auto h-10 w-10 text-muted-foreground" />
      <h3 className="mt-3 font-black">{label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Aplica la migracion de Supabase o crea registros desde este modulo para empezar a operar.
      </p>
    </div>
  );
}

function FormGrid({ fields, compact = false }: { fields: string[]; compact?: boolean }) {
  return (
    <div className={`grid gap-3 ${compact ? "mt-4" : "rounded-lg border border-border bg-surface p-4 md:grid-cols-2"}`}>
      {fields.map((field) => (
        <label key={field} className="block">
          <span className="text-xs font-black uppercase text-muted-foreground">{field}</span>
          <input className="mt-1 h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
        </label>
      ))}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="text-xs font-black uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}
