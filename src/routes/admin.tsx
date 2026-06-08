import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  EyeOff,
  FileArchive,
  FileText,
  FolderTree,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
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
  Trash2,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import JSZip from "jszip";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { buildPayload, createAdminRecord, listAdminRecords } from "@/lib/admin-crud";
import {
  FALLBACK_PRODUCT_IMAGE,
  getAdminProductOptions,
  getAdminProductPage,
  getCategories,
  getStores,
  type AdminProductStatus,
} from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import {
  leafName,
  matchProductByImageName,
  MEDIA_BUCKETS,
  uploadAdminMediaFile,
  isSupportedImageName,
  inferMimeType,
} from "@/lib/media-storage";
import { cn } from "@/lib/utils";
import type { Product, Store as StoreType } from "@/lib/types";
import type { Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type AdminModule =
  | "dashboard"
  | "orders"
  | "recovery"
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

const ADMIN_MODULE_IDS = [
  "dashboard",
  "orders",
  "recovery",
  "products",
  "categories",
  "media",
  "variants",
  "inventory",
  "stock-realtime",
  "price-lists",
  "shipping",
  "shipping-products",
  "forza",
  "sap-queue",
  "invoices",
  "b2c-users",
  "b2b-users",
  "crm",
  "support",
  "promotions",
  "campaigns",
  "coupons",
  "content",
  "notifications",
  "audit",
  "payments",
  "reports",
  "permissions",
  "integrations",
  "settings",
] as const satisfies readonly AdminModule[];

const isAdminModule = (value: unknown): value is AdminModule =>
  typeof value === "string" && (ADMIN_MODULE_IDS as readonly string[]).includes(value);

const ADMIN_LOGO_URL = "https://rpqnenzvnkaytaguvape.supabase.co/storage/v1/object/public/logo/logo%20renova%20ferre%20blanco.png";

type AdminData = {
  products: Product[];
  stores: StoreType[];
  categories: Category[];
  records: AdminRecords;
};

type DbRecord = Record<string, unknown>;

type AdminRecords = {
  orders: DbRecord[];
  orderItems: DbRecord[];
  orderStatusHistory: DbRecord[];
  recoveryTasks: DbRecord[];
  carts: DbRecord[];
  payments: DbRecord[];
  paymentEvents: DbRecord[];
  inventory: DbRecord[];
  priceLists: DbRecord[];
  customerAccounts: DbRecord[];
  shippingMethods: DbRecord[];
  shippingRules: DbRecord[];
  paymentGateways: DbRecord[];
  productImages: DbRecord[];
  categoryImages: DbRecord[];
  productVariants: DbRecord[];
  inventoryReservations: DbRecord[];
  shipments: DbRecord[];
  integrationQueue: DbRecord[];
  sapEvents: DbRecord[];
  sapEntityMappings: DbRecord[];
  sapSyncLogs: DbRecord[];
  idempotencyKeys: DbRecord[];
  invoices: DbRecord[];
  crmTimeline: DbRecord[];
  supportTickets: DbRecord[];
  marketingCampaigns: DbRecord[];
  couponRules: DbRecord[];
  notifications: DbRecord[];
  auditLogs: DbRecord[];
  banners: DbRecord[];
  profiles: DbRecord[];
  userRoles: DbRecord[];
  systemSettings: DbRecord[];
};

type Field = {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "number" | "email" | "select" | "textarea";
  options?: Array<string | { label: string; value: string }>;
  required?: boolean;
};

type AdminDataPatch = {
  products?: Product[];
  stores?: StoreType[];
  categories?: Category[];
  records?: Partial<AdminRecords>;
};

const emptyAdminRecords = (): AdminRecords => ({
  orders: [],
  orderItems: [],
  orderStatusHistory: [],
  recoveryTasks: [],
  carts: [],
  payments: [],
  paymentEvents: [],
  inventory: [],
  priceLists: [],
  customerAccounts: [],
  shippingMethods: [],
  shippingRules: [],
  paymentGateways: [],
  productImages: [],
  categoryImages: [],
  productVariants: [],
  inventoryReservations: [],
  shipments: [],
  integrationQueue: [],
  sapEvents: [],
  sapEntityMappings: [],
  sapSyncLogs: [],
  idempotencyKeys: [],
  invoices: [],
  crmTimeline: [],
  supportTickets: [],
  marketingCampaigns: [],
  couponRules: [],
  notifications: [],
  auditLogs: [],
  banners: [],
  profiles: [],
  userRoles: [],
  systemSettings: [],
});

const emptyAdminData = (): AdminData => ({
  products: [],
  stores: [],
  categories: [],
  records: emptyAdminRecords(),
});

const mergeAdminData = (current: AdminData, patch: AdminDataPatch): AdminData => ({
  products: patch.products ?? current.products,
  stores: patch.stores ?? current.stores,
  categories: patch.categories ?? current.categories,
  records: { ...current.records, ...(patch.records ?? {}) },
});

async function loadAdminData(): Promise<AdminData> {
  return emptyAdminData();
}

async function loadAdminModuleData(module: AdminModule): Promise<AdminDataPatch> {
  switch (module) {
    case "dashboard": {
      const [products, stores, orders, payments, reservations, shipments, integrationQueue, recoveryTasks] = await Promise.all([
        getAdminProductOptions(250),
        getStores(),
        listAdminRecords("orders", "*", 250),
        listAdminRecords("payments", "*", 250),
        listAdminRecords("inventory_reservations", "*", 250),
        listAdminRecords("shipments", "*", 250),
        listAdminRecords("integration_event_queue", "*", 250),
        listAdminRecords("error_recovery_tasks", "*", 250),
      ]);
      return {
        products,
        stores,
        records: { orders, payments, inventoryReservations: reservations, shipments, integrationQueue, recoveryTasks },
      };
    }
    case "products": {
      const categories = await getCategories();
      return { categories };
    }
    case "categories": {
      const categories = await getCategories();
      return { categories };
    }
    case "media": {
      const [products, categories, productImages, categoryImages, banners] = await Promise.all([
        getAdminProductOptions(6000),
        getCategories(),
        listAdminRecords("product_images", "*", 1000),
        listAdminRecords("category_images", "*", 1000),
        listAdminRecords("promotional_banners", "*", 500),
      ]);
      return { products, categories, records: { productImages, categoryImages, banners } };
    }
    case "variants": {
      const [products, productVariants] = await Promise.all([
        getAdminProductOptions(1500),
        listAdminRecords("product_variants", "*", 1000),
      ]);
      return { products, records: { productVariants } };
    }
    case "inventory":
    case "stock-realtime": {
      const [products, stores, inventory, inventoryReservations] = await Promise.all([
        getAdminProductOptions(1500),
        getStores(),
        listAdminRecords("inventory", "*", 1000),
        listAdminRecords("inventory_reservations", "*", 1000),
      ]);
      return { products, stores, records: { inventory, inventoryReservations } };
    }
    case "price-lists": {
      const priceLists = await listAdminRecords("admin_price_lists", "*", 1000);
      return { records: { priceLists } };
    }
    case "orders": {
      const [orders, orderItems, orderStatusHistory, payments, inventoryReservations] = await Promise.all([
        listAdminRecords("orders", "*", 500),
        listAdminRecords("order_items", "*", 1000),
        listAdminRecords("order_status_history", "*", 1000),
        listAdminRecords("payments", "*", 500),
        listAdminRecords("inventory_reservations", "*", 500),
      ]);
      return { records: { orders, orderItems, orderStatusHistory, payments, inventoryReservations } };
    }
    case "recovery": {
      const [recoveryTasks, integrationQueue] = await Promise.all([
        listAdminRecords("error_recovery_tasks", "*", 500),
        listAdminRecords("integration_event_queue", "*", 500),
      ]);
      return { records: { recoveryTasks, integrationQueue } };
    }
    case "invoices": {
      const invoices = await listAdminRecords("invoices", "*", 500);
      return { records: { invoices } };
    }
    case "shipping": {
      const [stores, shippingMethods] = await Promise.all([getStores(), listAdminRecords("shipping_methods", "*", 500)]);
      return { stores, records: { shippingMethods } };
    }
    case "shipping-products": {
      const [products, shippingRules] = await Promise.all([
        getAdminProductOptions(1500),
        listAdminRecords("product_shipping_rules", "*", 1000),
      ]);
      return { products, records: { shippingRules } };
    }
    case "forza": {
      const shipments = await listAdminRecords("shipments", "*", 500);
      return { records: { shipments } };
    }
    case "sap-queue":
    case "integrations": {
      const [integrationQueue, sapEvents, sapEntityMappings, sapSyncLogs, idempotencyKeys, systemSettings] = await Promise.all([
        listAdminRecords("integration_event_queue", "*", 500),
        listAdminRecords("sap_events", "*", 500),
        listAdminRecords("sap_entity_mappings", "*", 500),
        listAdminRecords("sap_sync_logs", "*", 500),
        listAdminRecords("idempotency_keys", "*", 500),
        listAdminRecords("system_settings", "*", 500),
      ]);
      return { records: { integrationQueue, sapEvents, sapEntityMappings, sapSyncLogs, idempotencyKeys, systemSettings } };
    }
    case "b2c-users":
    case "b2b-users": {
      const customerAccounts = await listAdminRecords("sap_business_partners", "*", 1000);
      return { records: { customerAccounts } };
    }
    case "crm": {
      const [customerAccounts, crmTimeline] = await Promise.all([
        listAdminRecords("sap_business_partners", "*", 1000),
        listAdminRecords("crm_activity_timeline", "*", 500),
      ]);
      return { records: { customerAccounts, crmTimeline } };
    }
    case "support": {
      const supportTickets = await listAdminRecords("support_tickets", "*", 500);
      return { records: { supportTickets } };
    }
    case "promotions":
    case "campaigns":
    case "content": {
      const [marketingCampaigns, banners] = await Promise.all([
        listAdminRecords("marketing_campaigns", "*", 500),
        listAdminRecords("promotional_banners", "*", 500),
      ]);
      return { records: { marketingCampaigns, banners } };
    }
    case "coupons": {
      const couponRules = await listAdminRecords("coupon_rules", "*", 500);
      return { records: { couponRules } };
    }
    case "notifications": {
      const notifications = await listAdminRecords("notifications", "*", 500);
      return { records: { notifications } };
    }
    case "payments": {
      const [paymentGateways, paymentEvents, payments] = await Promise.all([
        listAdminRecords("payment_gateways", "*", 500),
        listAdminRecords("payment_events", "*", 500),
        listAdminRecords("payments", "*", 500),
      ]);
      return { records: { paymentGateways, paymentEvents, payments } };
    }
    case "audit": {
      const auditLogs = await listAdminRecords("audit_logs", "*", 500);
      return { records: { auditLogs } };
    }
    case "permissions": {
      const [profiles, userRoles, auditLogs] = await Promise.all([
        listAdminRecords("profiles", "*", 500),
        listAdminRecords("user_roles", "*", 500),
        listAdminRecords("audit_logs", "*", 500),
      ]);
      return { records: { profiles, userRoles, auditLogs } };
    }
    case "settings": {
      const [shippingMethods, paymentGateways, systemSettings] = await Promise.all([
        listAdminRecords("shipping_methods", "*", 500),
        listAdminRecords("payment_gateways", "*", 500),
        listAdminRecords("system_settings", "*", 500),
      ]);
      return { records: { shippingMethods, paymentGateways, systemSettings } };
    }
    case "reports": {
      const [products, stores, orders, payments, shipments] = await Promise.all([
        getAdminProductOptions(500),
        getStores(),
        listAdminRecords("orders", "*", 500),
        listAdminRecords("payments", "*", 500),
        listAdminRecords("shipments", "*", 500),
      ]);
      return { products, stores, records: { orders, payments, shipments } };
    }
    default:
      return {};
  }
}

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    module: isAdminModule(search.module) ? search.module : undefined,
    audit: typeof search.audit === "string" ? search.audit : undefined,
  }),
  loader: loadAdminData,
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
  { id: "recovery", label: "Recuperacion critica", icon: Bell, group: "Operacion" },
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

const formatMaybePrice = (value: unknown) => {
  if (typeof value === "number") return formatPrice(value);
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return formatPrice(Number(value));
  return "";
};

const csvCell = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const adminFrom = (table: string) =>
  (supabase as unknown as {
    from: (table: string) => {
      insert: (payload: DbRecord | DbRecord[]) => {
        select: (columns?: string) => {
          single: () => Promise<{ data: DbRecord | null; error: Error | null }>;
        };
      };
      update: (payload: DbRecord) => {
        eq: (column: string, value: unknown) => Promise<{ data: DbRecord[] | null; error: Error | null }>;
      };
      delete: () => {
        eq: (column: string, value: unknown) => Promise<{ data: null; error: Error | null }>;
      };
    };
  }).from(table);

const BANNER_PLACEMENTS = {
  home_slider: {
    label: "Slider principal",
    hint: "Aparece arriba en la home.",
    desktop: "1920 x 520 px",
    mobile: "1080 x 1080 px",
    ratio: "Desktop 3.7:1 / mobile 1:1",
  },
  category_hero: {
    label: "Hero de categoria",
    hint: "Aparece al entrar a un departamento.",
    desktop: "1600 x 420 px",
    mobile: "1080 x 760 px",
    ratio: "Desktop 3.8:1 / mobile 1.4:1",
  },
  sidebar: {
    label: "Bloque promocional",
    hint: "Aparece en zonas secundarias de tienda.",
    desktop: "720 x 900 px",
    mobile: "1080 x 1080 px",
    ratio: "4:5 o cuadrado",
  },
  popup: {
    label: "Popup promocional",
    hint: "Aparece como promocion temporal.",
    desktop: "900 x 900 px",
    mobile: "900 x 900 px",
    ratio: "1:1",
  },
} as const;

type BannerPlacement = keyof typeof BANNER_PLACEMENTS;

const PAGE_DESTINATIONS = [
  { label: "Inicio", value: "/" },
  { label: "Tiendas", value: "/stores" },
  { label: "Mis pedidos", value: "/account/orders" },
  { label: "Mi cuenta", value: "/account" },
  { label: "Politica de devoluciones", value: "/returns" },
];

const ADMIN_SOFT_BUTTON =
  "border border-primary/20 bg-primary/10 font-black text-primary shadow-none hover:bg-primary/15 hover:text-primary";
const ADMIN_SOFT_BUTTON_STRONG =
  "border border-primary/25 bg-primary/10 font-black text-primary shadow-none hover:bg-primary/20 hover:text-primary";
const ADMIN_ICON_TILE = "flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary";

const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

async function invokeAdminOperation(body: DbRecord) {
  const { data, error } = await supabase.functions.invoke("admin-ops-handler", { body });
  if (error) throw error;
  const response = data as DbRecord | null;
  if (response?.ok === false) throw new Error(asText(response, "error", "Operacion administrativa fallida"));
  return response ?? { ok: true };
}

const readAdminModuleFromUrl = (): AdminModule => {
  if (typeof window === "undefined") return "dashboard";
  const params = new URLSearchParams(window.location.search);
  const module = params.get("module");
  return isAdminModule(module) ? module : "dashboard";
};

const writeAdminModuleToUrl = (module: AdminModule) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("module", module);
  window.history.replaceState(null, "", url);
};

const ADMIN_ACCESS_CACHE_KEY = "renova_admin_access_v3";
const ADMIN_ACCESS_CACHE_MS = 10 * 60 * 1000;

type AdminAccessCache = {
  userId: string;
  role: string;
  status: string;
  expiresAt: number;
};

const getAdminAccessStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage ?? window.sessionStorage ?? null;
};

const readAdminAccessCache = (userId: string): AdminAccessCache | null => {
  const storage = getAdminAccessStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(ADMIN_ACCESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminAccessCache>;
    if (parsed.userId !== userId || !parsed.expiresAt || parsed.expiresAt < Date.now()) return null;
    if (parsed.status !== "active" || !["admin", "super_admin"].includes(String(parsed.role))) return null;
    return parsed as AdminAccessCache;
  } catch {
    return null;
  }
};

const writeAdminAccessCache = (cache: Omit<AdminAccessCache, "expiresAt">) => {
  const storage = getAdminAccessStorage();
  if (!storage) return;
  storage.setItem(
    ADMIN_ACCESS_CACHE_KEY,
    JSON.stringify({ ...cache, expiresAt: Date.now() + ADMIN_ACCESS_CACHE_MS }),
  );
};

const clearAdminAccessCache = () => {
  if (typeof window === "undefined") return;
  window.localStorage?.removeItem(ADMIN_ACCESS_CACHE_KEY);
  window.sessionStorage?.removeItem(ADMIN_ACCESS_CACHE_KEY);
};

function AdminPage() {
  const initialData = Route.useLoaderData();
  const search = Route.useSearch();
  const { user, loading, signOut } = useAuth();
  const [data, setData] = useState<AdminData>(initialData);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [moduleLoading, setModuleLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<AdminModule>(() => search.module ?? readAdminModuleFromUrl());
  const [createModule, setCreateModule] = useState<AdminModule | null>(null);
  const [saving, setSaving] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const activeMeta = modules.find((module) => module.id === activeModule) ?? modules[0];

  const selectModule = (module: AdminModule) => {
    setActiveModule(module);
    writeAdminModuleToUrl(module);
  };

  useEffect(() => {
    const syncFromUrl = () => {
      const nextModule = readAdminModuleFromUrl();
      setActiveModule((current) => (current === nextModule ? current : nextModule));
    };
    window.addEventListener("popstate", syncFromUrl);
    const interval = window.setInterval(syncFromUrl, 250);
    syncFromUrl();
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!search.module) return;
    setActiveModule((current) => (current === search.module ? current : search.module));
  }, [search.module]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      clearAdminAccessCache();
      setAccess("denied");
      return;
    }

    let cancelled = false;
    const cached = readAdminAccessCache(user.id);
    if (cached) setAccess("allowed");
    else setAccess("checking");

    supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single()
      .then(({ data: profile, error }) => {
        if (cancelled) return;
        const role = String((profile as DbRecord | null)?.role ?? "");
        const status = String((profile as DbRecord | null)?.status ?? "active");
        const allowed = !error && status === "active" && ["admin", "super_admin"].includes(role);
        if (allowed) {
          writeAdminAccessCache({ userId: user.id, role, status });
          setAccess("allowed");
        } else {
          clearAdminAccessCache();
          setAccess("denied");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  useEffect(() => {
    if (access !== "allowed") return;
    let cancelled = false;
    setModuleLoading(true);
    loadAdminModuleData(activeModule)
      .then((patch) => {
        if (cancelled) return;
        setData((current) => mergeAdminData(current, patch));
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error("No se pudo cargar este modulo", {
          description: (error as Error).message,
        });
      })
      .finally(() => {
        if (!cancelled) setModuleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [access, activeModule, user?.id]);

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

  const submitAdminLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdminLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });
      if (error) throw error;
      clearAdminAccessCache();
      setAccess("checking");
      toast.success("Sesion administrativa iniciada");
    } catch (error) {
      toast.error("No se pudo iniciar sesion admin", {
        description: (error as Error).message,
      });
    } finally {
      setAdminLoginLoading(false);
    }
  };

  if (loading || access === "checking") {
    return <AdminAccessState title="Validando acceso" description="Estamos verificando tu sesion y permisos administrativos." />;
  }

  if (access !== "allowed") {
    if (!user) {
      return (
        <AdminLoginScreen
          email={adminEmail}
          password={adminPassword}
          submitting={adminLoginLoading}
          onEmailChange={setAdminEmail}
          onPasswordChange={setAdminPassword}
          onSubmit={submitAdminLogin}
        />
      );
    }

    return (
      <AdminAccessState
        title="Usuario sin permisos administrativos"
        description="La sesion actual no tiene rol admin o super_admin. Cierra sesion e ingresa con una cuenta autorizada."
        action={<Button onClick={() => signOut()} className="bg-primary font-black hover:bg-primary-hover">Cerrar sesion</Button>}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-[#142033]">
      <div className="grid min-h-screen lg:grid-cols-[292px_1fr]">
          <AdminSidebar activeModule={activeModule} onSelect={selectModule} />
        <main className="min-w-0">
          <AdminTopbar activeMeta={activeMeta} activeModule={activeModule} moduleLoading={moduleLoading} onCreate={() => openCreate()} onSelectModule={selectModule} />
          <AdminMobileModuleNav activeModule={activeModule} onSelect={selectModule} />
          <div className="p-4 md:p-6">
            <ModuleWindow module={activeModule} data={data} onCreate={openCreate} />
          </div>
        </main>
      </div>
      {createModule && (
        <CreateRecordModal
          module={createModule}
          data={data}
          saving={saving}
          onClose={() => setCreateModule(null)}
          onSave={saveRecord}
        />
      )}
    </div>
  );
}

function AdminLoginScreen({
  email,
  password,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_18%_12%,#ff8a1f_0,#f45a00_34%,#853a12_68%,#201b22_100%)] px-4 py-10 text-[#111827]">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-[0_30px_90px_rgba(0,0,0,0.28)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[600px] overflow-hidden bg-[linear-gradient(145deg,#ff8a1f_0%,#f45a00_55%,#4b342d_100%)] p-12 text-white lg:block">
          <img src={ADMIN_LOGO_URL} alt="Renova" className="h-20 w-56 object-contain" />
          <div className="absolute left-12 top-1/2 max-w-sm -translate-y-1/2">
            <div className="text-sm font-black uppercase tracking-[0.22em] text-white/70">Renova OS</div>
            <h1 className="mt-4 text-4xl font-black leading-tight">Centro operativo ecommerce</h1>
            <p className="mt-4 text-base leading-relaxed text-white/85">
              Gestion integral de catalogo, pedidos, inventario, pagos, marketing y SAP.
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(160deg,transparent_20%,rgba(255,255,255,0.18)_21%,rgba(255,255,255,0.18)_38%,transparent_39%)]" />
        </section>

        <section className="flex min-h-[560px] items-center justify-center p-6 sm:p-10 lg:p-16">
          <div className="w-full max-w-xl">
            <div className="mb-8 lg:hidden">
              <img src={ADMIN_LOGO_URL} alt="Renova" className="h-16 w-44 object-contain [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.2))]" />
            </div>
            <div className="text-sm font-black text-primary">Hola.</div>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Inicia sesion en el administrador</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Este acceso es solo para administradores de Renova OS.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-bold text-muted-foreground">Correo administrativo</span>
                <div className="relative mt-2">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="admin@renova.local"
                    className="h-12 w-full rounded-md border border-transparent bg-[#eaf1ff] pl-11 pr-4 text-base outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-sm font-bold text-muted-foreground">Contrasena</span>
                <div className="relative mt-2">
                  <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    placeholder="Tu contrasena"
                    className="h-12 w-full rounded-md border border-transparent bg-[#eaf1ff] pl-11 pr-4 text-base outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/15"
                  />
                </div>
              </label>
              <Button type="submit" disabled={submitting} className="h-12 w-full bg-primary text-sm font-black uppercase tracking-wide shadow-lg shadow-primary/20 hover:bg-primary-hover">
                {submitting ? "Validando..." : "Ingresar"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminAccessState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f5f8] px-4 text-[#172033]">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-[var(--shadow-enterprise)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
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
    <aside className="hidden min-h-screen border-r border-[#e4e8f0] bg-white text-[#142033] lg:block">
      <div className="border-b border-[#e4e8f0] px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-24 items-center justify-center rounded-lg bg-primary px-3">
            <img
              src={ADMIN_LOGO_URL}
              alt="Renova"
              className="h-8 w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.28em] text-primary">RENOVA OS</div>
            <div className="truncate text-sm font-bold text-muted-foreground">Super Admin</div>
          </div>
        </div>
      </div>
      <nav className="h-[calc(100vh-90px)] overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group} className="mb-2">
            <button
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-[#f3f5f8] hover:text-foreground"
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
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                      activeModule === module.id
                        ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--color-primary)]"
                        : "text-[#5d6878] hover:bg-[#f3f5f8] hover:text-foreground"
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
  moduleLoading,
  onCreate,
  onSelectModule,
}: {
  activeMeta: (typeof modules)[number];
  activeModule: AdminModule;
  moduleLoading: boolean;
  onCreate: () => void;
  onSelectModule: (module: AdminModule) => void;
}) {
  const [moduleQuery, setModuleQuery] = useState("");
  const normalizedQuery = moduleQuery.trim().toLowerCase();
  const matches = normalizedQuery
    ? modules.filter((module) => `${module.group} ${module.label}`.toLowerCase().includes(normalizedQuery)).slice(0, 6)
    : [];

  const selectModule = (module: AdminModule) => {
    onSelectModule(module);
    setModuleQuery("");
  };

  const submitSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || matches.length === 0) return;
    event.preventDefault();
    selectModule(matches[0].id);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white">
      <div className="flex min-h-16 items-center gap-4 px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={ADMIN_ICON_TILE}>
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
            value={moduleQuery}
            onChange={(event) => setModuleQuery(event.target.value)}
            onKeyDown={submitSearch}
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Buscar modulo, flujo o configuracion..."
          />
          {matches.length > 0 && (
            <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
              {matches.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => selectModule(module.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-bold hover:bg-surface"
                >
                  <module.icon className="h-4 w-4 text-primary" />
                  <span>{module.group} / {module.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            onSelectModule("notifications");
            toast.info("Abriendo centro de notificaciones");
          }}
          aria-label="Abrir notificaciones"
        >
          <Bell className="h-4 w-4" />
        </Button>
        {moduleLoading && (
          <span className="hidden rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary md:inline-flex">
            Actualizando
          </span>
        )}
        {canCreateModule(activeModule) && (
          <Button onClick={onCreate} className={cn(ADMIN_SOFT_BUTTON, "hidden md:inline-flex")}>
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
      return (
        <ProductsWindow
          products={data.products}
          categories={data.categories}
          images={data.records.productImages}
          onCreate={() => onCreate("products")}
        />
      );
    case "categories":
      return <CategoriesWindow categories={data.categories} onCreate={() => onCreate("categories")} />;
    case "media":
      return (
        <ProductMediaWindow
          products={data.products}
          categories={data.categories}
          images={data.records.productImages}
          categoryImages={data.records.categoryImages}
          banners={data.records.banners}
        />
      );
    case "variants":
      return <VariantsWindow products={data.products} variants={data.records.productVariants} onCreate={() => onCreate("variants")} />;
    case "inventory":
      return <InventoryWindow products={data.products} stores={data.stores} inventory={data.records.inventory} onReserve={() => onCreate("stock-realtime")} />;
    case "stock-realtime":
      return <StockRealtimeWindow products={data.products} stores={data.stores} inventory={data.records.inventory} reservations={data.records.inventoryReservations} onCreate={() => onCreate("stock-realtime")} />;
    case "price-lists":
      return <PriceListsWindow rows={data.records.priceLists} onCreate={() => onCreate("price-lists")} />;
    case "orders":
      return (
        <OrdersWindow
          orders={data.records.orders}
          orderItems={data.records.orderItems}
          orderStatusHistory={data.records.orderStatusHistory}
          payments={data.records.payments}
          reservations={data.records.inventoryReservations}
        />
      );
    case "recovery":
      return <RecoveryWindow tasks={data.records.recoveryTasks} queue={data.records.integrationQueue} />;
    case "invoices":
      return <EnterpriseWindow module={module} title="Facturacion" description="Facturas, PDF, estado fiscal y referencia SAP." icon={FileText} headers={["Factura", "Pedido", "Total", "SAP", "Estado"]} rows={data.records.invoices.map((item) => [asText(item, "invoice_number"), asText(item, "order_id"), formatMaybePrice(item.total), asText(item, "sap_doc_num"), asText(item, "status")])} onCreate={onCreate} />;
    case "shipping":
      return <ShippingWindow stores={data.stores} methods={data.records.shippingMethods} onCreate={() => onCreate("shipping")} />;
    case "shipping-products":
      return <ShippingProductsWindow products={data.products} rules={data.records.shippingRules} onCreate={() => onCreate("shipping-products")} />;
    case "forza":
      return <ForzaWindow shipments={data.records.shipments} onCreate={() => onCreate("forza")} />;
    case "sap-queue":
      return (
        <SapMiddlewareWindow
          queue={data.records.integrationQueue}
          sapEvents={data.records.sapEvents}
          idempotencyKeys={data.records.idempotencyKeys}
          mappings={data.records.sapEntityMappings}
          syncLogs={data.records.sapSyncLogs}
          settings={data.records.systemSettings}
        />
      );
    case "b2c-users":
      return <B2CUsersWindow rows={data.records.customerAccounts.filter((item) => asText(item, "customer_type").toUpperCase() === "B2C")} onCreate={() => onCreate("b2c-users")} />;
    case "b2b-users":
      return <B2BUsersWindow rows={data.records.customerAccounts.filter((item) => asText(item, "customer_type").toUpperCase() === "B2B")} onCreate={() => onCreate("b2b-users")} />;
    case "crm":
      return <EnterpriseWindow module={module} title="CRM enterprise" description="Historial de compra, soporte, segmentos, loyalty, CLV y actividad por cliente." icon={Users} headers={["Cliente", "Actividad", "Titulo", "Fecha", "Estado"]} rows={data.records.crmTimeline.map((item) => [asText(item, "customer_account_id"), asText(item, "activity_type"), asText(item, "title"), formatDate(item), asText(item, "status")])} onCreate={onCreate} />;
    case "support":
      return <EnterpriseWindow module={module} title="Soporte y postventa" description="Tickets ligados a cliente, pedido, canal, prioridad y SLA." icon={Bell} headers={["Ticket", "Cliente", "Canal", "Prioridad", "Estado"]} rows={data.records.supportTickets.map((item) => [asText(item, "id"), asText(item, "customer_account_id"), asText(item, "channel"), asText(item, "priority"), asText(item, "status")])} onCreate={onCreate} />;
    case "promotions":
      return <PromotionHubWindow data={data} onCreate={onCreate} />;
    case "campaigns":
      return <EnterpriseWindow module={module} title="Campanas de marketing" description="Email, SMS, push, popup, abandonados, referidos, flash sales y segmentacion." icon={Megaphone} headers={["Campana", "Tipo", "Target", "Presupuesto", "Estado"]} rows={data.records.marketingCampaigns.map((item) => [asText(item, "name"), asText(item, "campaign_type"), JSON.stringify(item.target_rules ?? {}), formatMaybePrice(item.budget), asText(item, "status")])} onCreate={onCreate} />;
    case "coupons":
      return <EnterpriseWindow module={module} title="Cupones y descuentos" description="Reglas por monto, categoria, sucursal, segmento, B2B/B2C y vigencia." icon={Percent} headers={["Codigo", "Tipo", "Valor", "Minimo", "Estado"]} rows={data.records.couponRules.map((item) => [asText(item, "code"), asText(item, "discount_type"), asText(item, "discount_value"), formatMaybePrice(item.min_order_total), asText(item, "is_active")])} onCreate={onCreate} />;
    case "payments":
      return <PaymentsWindow rows={data.records.paymentGateways} events={data.records.paymentEvents} payments={data.records.payments} onCreate={() => onCreate("payments")} />;
    case "content":
      return <EnterpriseWindow module={module} title="Banners y contenido" description="Slider principal, bloques promocionales, paginas informativas y contenido SEO." icon={Megaphone} headers={["Titulo", "Placement", "URL", "Orden", "Estado"]} rows={data.records.banners.map((item) => [asText(item, "title"), asText(item, "placement"), asText(item, "target_url"), asText(item, "sort_order", "0"), asText(item, "is_active")])} onCreate={onCreate} />;
    case "notifications":
      return <EnterpriseWindow module={module} title="Notificaciones" description="Eventos transaccionales y marketing por email, SMS, WhatsApp, push e in-app." icon={Bell} headers={["Evento", "Canal", "Destino", "Estado", "Fecha"]} rows={data.records.notifications.map((item) => [asText(item, "event_type"), asText(item, "channel"), asText(item, "customer_account_id"), asText(item, "status"), formatDate(item)])} onCreate={onCreate} />;
    case "audit":
      return <EnterpriseWindow module={module} title="Auditoria y seguridad" description="Bitacora de cambios criticos, actor, entidad, datos antes/despues y trazabilidad." icon={ShieldCheck} headers={["Accion", "Entidad", "ID", "Actor", "Fecha"]} rows={data.records.auditLogs.map((item) => [asText(item, "action"), asText(item, "entity_type"), asText(item, "entity_id"), asText(item, "actor_id"), formatDate(item)])} onCreate={onCreate} />;
    case "reports":
      return <SimpleManagementWindow module={module} title="Reportes" description="Ventas, productos, clientes, pagos, envios, inventario y exportaciones." icon={BarChart3} data={data} onCreate={onCreate} />;
    case "permissions":
      return <PermissionsWindow profiles={data.records.profiles} userRoles={data.records.userRoles} auditLogs={data.records.auditLogs} />;
    case "integrations":
      return (
        <SapMiddlewareWindow
          queue={data.records.integrationQueue}
          sapEvents={data.records.sapEvents}
          idempotencyKeys={data.records.idempotencyKeys}
          mappings={data.records.sapEntityMappings}
          syncLogs={data.records.sapSyncLogs}
          settings={data.records.systemSettings}
        />
      );
    case "settings":
      return <SettingsWindow data={data} />;
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-muted-foreground">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <span>Datos de Supabase</span>
      </div>
      <span>Vista operativa</span>
    </div>
  );
}

const PRODUCT_STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "needs_enrichment", label: "Pendientes" },
  { value: "enriched", label: "Enriquecidos" },
  { value: "published", label: "Publicados" },
  { value: "draft", label: "Borrador" },
  { value: "archived", label: "Archivados" },
] as const;

function productStatusLabel(status?: string) {
  switch (status) {
    case "published":
      return "Publicado";
    case "enriched":
      return "Enriquecido";
    case "needs_enrichment":
      return "Pendiente";
    case "archived":
      return "Archivado";
    default:
      return "Borrador";
  }
}

function productStatusClass(status?: string) {
  switch (status) {
    case "published":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "enriched":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "needs_enrichment":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "archived":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-border bg-surface text-muted-foreground";
  }
}

const productMediaUrl = (image: DbRecord) => asText(image, "image_url", asText(image, "url"));

const sortedProductMedia = (images: DbRecord[]) =>
  [...images].sort((a, b) => {
    const primaryDelta = (asText(b, "is_primary") === "true" ? 1 : 0) - (asText(a, "is_primary") === "true" ? 1 : 0);
    return primaryDelta || asNumber(a, "sort_order") - asNumber(b, "sort_order") || asText(a, "created_at").localeCompare(asText(b, "created_at"));
  });

const productMediaUrls = (images: DbRecord[]) =>
  Array.from(new Set(sortedProductMedia(images).map(productMediaUrl).filter(Boolean)));

function productReadiness(product: Product, imageCount: number) {
  const missing: string[] = [];
  if (!product.name.trim()) missing.push("Nombre");
  if (!product.slug.trim()) missing.push("Slug");
  if (!product.categoryId && !product.categorySlug) missing.push("Categoria");
  if (!product.description.trim() && !product.shortDescription?.trim()) missing.push("Descripcion");
  if (product.price <= 0) missing.push("Precio SAP");
  const hasRealImage =
    imageCount > 0 ||
    (product.image.trim() !== "" && !product.image.includes("logo-renova") && !product.image.includes("puntos.renovagt.com/assets/logo-renova"));
  if (!hasRealImage) missing.push("Imagen de producto");
  return missing;
}

function ProductsWindow({
  categories,
  onCreate,
}: {
  products: Product[];
  categories: Category[];
  images: DbRecord[];
  onCreate: () => void;
}) {
  const emptyCounts = useMemo(
    () =>
      PRODUCT_STATUS_OPTIONS.reduce<Record<AdminProductStatus, number>>((acc, option) => {
        acc[option.value] = 0;
        return acc;
      }, {} as Record<AdminProductStatus, number>),
    [],
  );
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [localImages, setLocalImages] = useState<DbRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminProductStatus>("all");
  const [selectedId, setSelectedId] = useState("");
  const [page, setPage] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [counts, setCounts] = useState<Record<AdminProductStatus, number>>(emptyCounts);
  const [productsLoading, setProductsLoading] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [editor, setEditor] = useState({
    name: "",
    slug: "",
    price: "",
    originalPrice: "",
    categoryId: "",
    ecommerceStatus: "needs_enrichment",
    shortDescription: "",
    description: "",
  });
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(0);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    getAdminProductPage({ page, pageSize, status: statusFilter, search: debouncedQuery })
      .then((result) => {
        if (cancelled) return;
        setLocalProducts(result.products);
        setTotalProducts(result.total);
        setCounts({ ...emptyCounts, ...result.counts });
        setSelectedId((current) => {
          if (current && result.products.some((product) => product.id === current)) return current;
          return result.products[0]?.id ?? "";
        });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error("No se pudieron cargar productos", { description: (error as Error).message });
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, emptyCounts, page, statusFilter]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedId) {
      setLocalImages([]);
      return;
    }

    let cancelled = false;
    supabase
      .from("product_images")
      .select("id,product_id,url,image_url,alt,alt_text,is_primary,sort_order,created_at")
      .eq("product_id", selectedId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("No se pudo cargar la galeria", { description: error.message });
          setLocalImages([]);
          return;
        }
        setLocalImages((rows ?? []) as DbRecord[]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const productImagesById = useMemo(() => {
    const map = new Map<string, DbRecord[]>();
    localImages.forEach((image) => {
      const productId = asText(image, "product_id");
      if (!productId) return;
      map.set(productId, [...(map.get(productId) ?? []), image]);
    });
    for (const [productId, productImages] of map.entries()) {
      map.set(productId, sortedProductMedia(productImages));
    }
    return map;
  }, [localImages]);

  const filteredProducts = localProducts;

  const selectedProduct = localProducts.find((product) => product.id === selectedId) ?? localProducts[0];
  const selectedGallery = selectedProduct ? productImagesById.get(selectedProduct.id) ?? [] : [];
  const selectedGalleryUrls = productMediaUrls(selectedGallery);
  const selectedImageCount = selectedProduct ? Math.max(selectedGalleryUrls.length, selectedProduct.images?.length ?? 0) : 0;
  const missing = selectedProduct ? productReadiness(selectedProduct, selectedImageCount) : [];
  const canPublish = missing.length === 0;

  useEffect(() => {
    if (!selectedProduct) return;
    setEditor({
      name: selectedProduct.name,
      slug: selectedProduct.slug,
      price: String(selectedProduct.price || ""),
      originalPrice: selectedProduct.originalPrice ? String(selectedProduct.originalPrice) : "",
      categoryId: selectedProduct.categoryId ?? "",
      ecommerceStatus: selectedProduct.ecommerceStatus ?? "needs_enrichment",
      shortDescription: selectedProduct.shortDescription ?? "",
      description: selectedProduct.description ?? "",
    });
  }, [selectedProduct]);

  const updateLocalProduct = (productId: string, patch: Partial<Product>) => {
    setLocalProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, ...patch, updatedAt: new Date().toISOString() } : product)),
    );
  };

  const syncLocalGallery = (productId: string, nextImages: DbRecord[]) => {
    const urls = productMediaUrls(nextImages);
    if (urls.length > 0) {
      updateLocalProduct(productId, { image: urls[0], images: urls });
      return;
    }
    updateLocalProduct(productId, { image: FALLBACK_PRODUCT_IMAGE, images: [] });
  };

  const saveSelectedProduct = async (nextStatus = editor.ecommerceStatus) => {
    if (!selectedProduct) return;
    if (nextStatus === "published" && !canPublish) {
      toast.error("No se puede publicar todavia", {
        description: `Completa: ${missing.join(", ")}.`,
      });
      return;
    }

    const category = categories.find((item) => item.id === editor.categoryId);
    const status = nextStatus || "draft";
    const payload = {
      name: editor.name.trim(),
      slug: editor.slug.trim(),
      price: Number(editor.price || 0),
      original_price: editor.originalPrice ? Number(editor.originalPrice) : null,
      category_id: editor.categoryId || null,
      short_description: editor.shortDescription.trim() || null,
      description: editor.description.trim(),
      ecommerce_status: status,
      enrichment_status: status === "published" || status === "enriched" ? "complete" : status === "needs_enrichment" ? "needs_enrichment" : "in_review",
      enrichment_required: status === "needs_enrichment",
      is_active: status !== "archived",
    };

    setSavingProduct(true);
    try {
      await invokeAdminOperation({
        action: "update_product",
        product_id: selectedProduct.id,
        payload,
      });
      updateLocalProduct(selectedProduct.id, {
        name: payload.name,
        slug: payload.slug,
        price: payload.price,
        originalPrice: payload.original_price ?? undefined,
        categoryId: payload.category_id ?? undefined,
        categorySlug: category?.slug ?? selectedProduct.categorySlug,
        categoryName: category?.name ?? selectedProduct.categoryName,
        shortDescription: payload.short_description ?? undefined,
        description: payload.description,
        ecommerceStatus: payload.ecommerce_status,
        enrichmentStatus: payload.enrichment_status,
        enrichmentRequired: payload.enrichment_required,
        isActive: payload.is_active,
      });
      setEditor((current) => ({ ...current, ecommerceStatus: status }));
      toast.success(status === "published" ? "Producto publicado" : "Producto guardado", {
        description: selectedProduct.sku,
      });
    } catch (error) {
      toast.error("No se pudo actualizar el producto", { description: (error as Error).message });
    } finally {
      setSavingProduct(false);
    }
  };

  const uploadSelectedGallery = async () => {
    if (!selectedProduct || galleryFiles.length === 0) {
      toast.error("Selecciona imagenes", { description: "Carga una o mas fotos para este producto." });
      return;
    }

    setUploadingGallery(true);
    try {
      const existing = productImagesById.get(selectedProduct.id) ?? [];
      const createdImages: DbRecord[] = [];
      for (const [index, file] of galleryFiles.entries()) {
        if (!isSupportedImageName(file.name)) {
          toast.warning("Archivo omitido", { description: `${file.name} no es una imagen permitida.` });
          continue;
        }
        const uploaded = await uploadAdminMediaFile({
          bucket: MEDIA_BUCKETS.products,
          file,
          folder: `products/${selectedProduct.sku}`,
        });
        const response = await invokeAdminOperation({
          action: "create_product_image",
          product_id: selectedProduct.id,
          url: uploaded.publicUrl,
          image_url: uploaded.publicUrl,
          storage_path: uploaded.storagePath,
          alt: `${selectedProduct.name} ${existing.length + index + 1}`,
          alt_text: `${selectedProduct.name} ${existing.length + index + 1}`,
          sort_order: existing.length + index,
          is_primary: existing.length === 0 && index === 0,
        });
        if (response.image && typeof response.image === "object") createdImages.push(response.image as DbRecord);
      }

      if (createdImages.length > 0) {
        setLocalImages((current) => {
          const withoutCreated = current.filter((image) => !createdImages.some((created) => asText(created, "id") === asText(image, "id")));
          return [...createdImages, ...withoutCreated];
        });
        syncLocalGallery(selectedProduct.id, [...createdImages, ...existing]);
      }
      setGalleryFiles([]);
      toast.success("Galeria actualizada", { description: `${createdImages.length} imagen(es) guardadas para ${selectedProduct.sku}.` });
    } catch (error) {
      toast.error("No se pudo guardar la galeria", { description: (error as Error).message });
    } finally {
      setUploadingGallery(false);
    }
  };

  const setPrimaryGalleryImage = async (image: DbRecord) => {
    if (!selectedProduct) return;
    const imageId = asText(image, "id");
    if (!imageId) return;
    try {
      await invokeAdminOperation({
        action: "set_primary_product_image",
        product_id: selectedProduct.id,
        image_id: imageId,
      });
      const nextImages = (productImagesById.get(selectedProduct.id) ?? []).map((item) => ({
        ...item,
        is_primary: asText(item, "id") === imageId,
      }));
      setLocalImages((current) => current.map((item) => (asText(item, "product_id") === selectedProduct.id ? { ...item, is_primary: asText(item, "id") === imageId } : item)));
      syncLocalGallery(selectedProduct.id, nextImages);
      toast.success("Imagen principal actualizada");
    } catch (error) {
      toast.error("No se pudo marcar como principal", { description: (error as Error).message });
    }
  };

  const deleteGalleryImage = async (image: DbRecord) => {
    if (!selectedProduct) return;
    const imageId = asText(image, "id");
    if (!imageId) return;
    try {
      await invokeAdminOperation({
        action: "delete_product_image",
        product_id: selectedProduct.id,
        image_id: imageId,
      });
      const nextImages = (productImagesById.get(selectedProduct.id) ?? []).filter((item) => asText(item, "id") !== imageId);
      setLocalImages((current) => current.filter((item) => asText(item, "id") !== imageId));
      syncLocalGallery(selectedProduct.id, nextImages);
      toast.success("Imagen eliminada de la galeria");
    } catch (error) {
      toast.error("No se pudo eliminar la imagen", { description: (error as Error).message });
    }
  };

  return (
    <WindowFrame
      title="Gestion de productos"
      description="Enriquecimiento SAP, publicacion ecommerce, precios, SEO, imagenes y estado comercial."
      actions={
        <Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}>
          <Plus className="mr-1 h-4 w-4" /> Crear producto manual
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PRODUCT_STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setStatusFilter(option.value);
              setPage(0);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-black transition-colors",
              statusFilter === option.value
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-border bg-white text-muted-foreground hover:bg-primary/5 hover:text-primary",
            )}
          >
            {option.label} <span className="ml-1 text-xs">{counts[option.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(440px,0.9fr)_minmax(520px,1.1fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por SKU, ItemCode, nombre o categoria..."
                className="h-11 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
              <span>
                {productsLoading ? "Cargando productos..." : `${totalProducts.toLocaleString("es-GT")} producto(s) en este filtro`}
              </span>
              <span>
                Pagina {Math.min(page + 1, totalPages)} de {totalPages}
              </span>
            </div>
          </div>

          <div className="max-h-[640px] overflow-auto">
            {productsLoading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="grid grid-cols-[72px_1fr] gap-3 rounded-lg border border-border p-3">
                    <div className="aspect-square animate-pulse rounded-lg bg-surface" />
                    <div className="space-y-3 py-2">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-surface" />
                      <div className="h-6 w-40 animate-pulse rounded-full bg-surface" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No hay productos para este filtro.</div>
            ) : (
              filteredProducts.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                const imageCount = product.images?.length ?? 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedId(product.id)}
                    className={cn(
                      "grid w-full grid-cols-[72px_1fr] gap-3 border-b border-border p-3 text-left transition-colors hover:bg-primary/5",
                      isSelected && "bg-primary/10",
                    )}
                  >
                    <div className="aspect-square overflow-hidden rounded-lg border border-border bg-surface">
                      <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-contain p-1" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-black">{product.name}</span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-black", productStatusClass(product.ecommerceStatus))}>
                          {productStatusLabel(product.ecommerceStatus)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        SKU {product.sku} {product.sapItemCode && product.sapItemCode !== product.sku ? `- SAP ${product.sapItemCode}` : ""}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-surface px-2 py-1 font-bold">{formatPrice(product.price)}</span>
                        <span className={cn("rounded-full px-2 py-1 font-bold", product.stock > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                          Stock {product.stock}
                        </span>
                        <span className="rounded-full bg-surface px-2 py-1 font-bold">{imageCount} img</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border p-3">
            <Button
              type="button"
              disabled={productsLoading || page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className={ADMIN_SOFT_BUTTON}
            >
              Anterior
            </Button>
            <div className="text-xs font-black text-muted-foreground">
              {Math.min(page * pageSize + 1, totalProducts || 0).toLocaleString("es-GT")}-
              {Math.min((page + 1) * pageSize, totalProducts).toLocaleString("es-GT")} de {totalProducts.toLocaleString("es-GT")}
            </div>
            <Button
              type="button"
              disabled={productsLoading || page >= totalPages - 1}
              onClick={() => setPage((current) => current + 1)}
              className={ADMIN_SOFT_BUTTON}
            >
              Siguiente
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          {!selectedProduct ? (
            <div className="p-8 text-sm text-muted-foreground">Selecciona un producto para administrarlo.</div>
          ) : (
            <>
              <div className="border-b border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">Catalogo / Productos / {selectedProduct.sku}</div>
                    <h3 className="mt-1 text-2xl font-black">{selectedProduct.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Estado SAP preservado. Publicar solo cambia visibilidad ecommerce, no descuenta inventario SAP.
                    </p>
                  </div>
                  <span className={cn("rounded-full border px-3 py-1.5 text-xs font-black", productStatusClass(editor.ecommerceStatus))}>
                    {productStatusLabel(editor.ecommerceStatus)}
                  </span>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    <img src={selectedProduct.image} alt={selectedProduct.name} loading="lazy" className="aspect-square w-full object-contain p-3" />
                    <div className="border-t border-border bg-white p-3 text-xs text-muted-foreground">
                      {selectedImageCount > 0 ? `${selectedImageCount} imagen(es) en galeria` : "Sin galeria. Carga fotos aqui mismo."}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-white p-3">
                    <div className="text-xs font-black uppercase text-muted-foreground">Checklist publicar</div>
                    <div className="mt-3 space-y-2 text-sm">
                      {["Nombre", "Slug", "Categoria", "Descripcion", "Precio SAP", "Imagen de producto"].map((item) => {
                        const missingItem = missing.includes(item);
                        return (
                          <div key={item} className="flex items-center gap-2">
                            {missingItem ? <X className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                            <span className={missingItem ? "text-muted-foreground" : "font-bold"}>{item}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <MediaInput label="Nombre comercial">
                      <input
                        value={editor.name}
                        onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                        className="admin-input"
                      />
                    </MediaInput>
                    <MediaInput label="Slug ecommerce">
                      <input
                        value={editor.slug}
                        onChange={(event) => setEditor((current) => ({ ...current, slug: event.target.value }))}
                        className="admin-input"
                      />
                    </MediaInput>
                    <MediaInput label="Precio visible">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editor.price}
                        onChange={(event) => setEditor((current) => ({ ...current, price: event.target.value }))}
                        className="admin-input"
                      />
                    </MediaInput>
                    <MediaInput label="Precio anterior">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editor.originalPrice}
                        onChange={(event) => setEditor((current) => ({ ...current, originalPrice: event.target.value }))}
                        className="admin-input"
                      />
                    </MediaInput>
                    <MediaInput label="Categoria ecommerce">
                      <select
                        value={editor.categoryId}
                        onChange={(event) => setEditor((current) => ({ ...current, categoryId: event.target.value }))}
                        className="admin-input"
                      >
                        <option value="">Seleccionar categoria</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </MediaInput>
                    <MediaInput label="Estado ecommerce">
                      <select
                        value={editor.ecommerceStatus}
                        onChange={(event) => setEditor((current) => ({ ...current, ecommerceStatus: event.target.value }))}
                        className="admin-input"
                      >
                        <option value="needs_enrichment">Pendiente de enriquecimiento</option>
                        <option value="enriched">Enriquecido, no publicado</option>
                        <option value="published">Publicado en tienda</option>
                        <option value="draft">Borrador</option>
                        <option value="archived">Archivado</option>
                      </select>
                    </MediaInput>
                  </div>

                  <MediaInput label="Descripcion corta">
                    <input
                      value={editor.shortDescription}
                      onChange={(event) => setEditor((current) => ({ ...current, shortDescription: event.target.value }))}
                      className="admin-input"
                      placeholder="Texto corto para ficha y buscador"
                    />
                  </MediaInput>
                  <MediaInput label="Descripcion completa">
                    <textarea
                      value={editor.description}
                      onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))}
                      className="admin-input min-h-28 py-3"
                      placeholder="Beneficios, uso recomendado, garantia, contenido de caja..."
                    />
                  </MediaInput>

                  <div className="rounded-xl border border-border bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-black">Galeria del producto</div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Portada y fotos visibles en ficha, carrito y buscador. Ideal 1200 x 1200 px, fondo limpio.
                        </p>
                      </div>
                      <BadgeLike label={`${selectedImageCount} img`} />
                    </div>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-3">
                        <FilePicker multiple accept="image/png,image/jpeg,image/webp,image/avif" onChange={setGalleryFiles} />
                        {galleryFiles.length > 0 && (
                          <div className="rounded-md bg-surface px-3 py-2 text-xs font-bold text-muted-foreground">
                            {galleryFiles.length} archivo(s) seleccionado(s)
                          </div>
                        )}
                        <Button
                          type="button"
                          onClick={uploadSelectedGallery}
                          disabled={uploadingGallery || galleryFiles.length === 0}
                          className={cn(ADMIN_SOFT_BUTTON_STRONG, "w-full")}
                        >
                          <Upload className="mr-1 h-4 w-4" />
                          {uploadingGallery ? "Subiendo..." : "Guardar fotos"}
                        </Button>
                      </div>
                      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                        {selectedGallery.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
                            Aun no hay fotos guardadas para este producto.
                          </div>
                        ) : (
                          selectedGallery.map((image) => {
                            const url = productMediaUrl(image);
                            const imageId = asText(image, "id");
                            const isPrimary = asText(image, "is_primary") === "true";
                            return (
                              <div key={imageId || url} className="overflow-hidden rounded-lg border border-border bg-surface">
                                <img src={url} alt={asText(image, "alt", selectedProduct.name)} loading="lazy" className="aspect-square w-full object-contain p-2" />
                                <div className="space-y-2 border-t border-border bg-white p-2">
                                  <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate font-black">{isPrimary ? "Principal" : `Orden ${asText(image, "sort_order", "0")}`}</span>
                                    {isPrimary && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-black text-emerald-700">Activo</span>}
                                  </div>
                                  <div className="grid grid-cols-[1fr_auto] gap-2">
                                    <Button type="button" onClick={() => setPrimaryGalleryImage(image)} disabled={isPrimary} className={ADMIN_SOFT_BUTTON}>
                                      <Eye className="mr-1 h-4 w-4" /> Principal
                                    </Button>
                                    <Button type="button" onClick={() => deleteGalleryImage(image)} className="border border-destructive/20 bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15 hover:text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="grid gap-3 text-sm md:grid-cols-3">
                      <ConfigRow label="SAP ItemCode" value={selectedProduct.sapItemCode ?? selectedProduct.sku} />
                      <ConfigRow label="Marca" value={selectedProduct.brand || "Sin marca"} />
                      <ConfigRow label="Stock ecommerce" value={String(selectedProduct.stock)} />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                    <Button type="button" onClick={() => saveSelectedProduct("archived")} disabled={savingProduct} className={ADMIN_SOFT_BUTTON}>
                      <EyeOff className="mr-1 h-4 w-4" /> Archivar
                    </Button>
                    <Button type="button" onClick={() => saveSelectedProduct()} disabled={savingProduct} className={ADMIN_SOFT_BUTTON}>
                      <Save className="mr-1 h-4 w-4" /> Guardar cambios
                    </Button>
                    <Button type="button" onClick={() => saveSelectedProduct("enriched")} disabled={savingProduct} className={ADMIN_SOFT_BUTTON}>
                      <Save className="mr-1 h-4 w-4" /> Guardar enriquecido
                    </Button>
                    <Button type="button" onClick={() => saveSelectedProduct("published")} disabled={savingProduct || !canPublish} className={ADMIN_SOFT_BUTTON_STRONG}>
                      <Eye className="mr-1 h-4 w-4" /> Publicar
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </WindowFrame>
  );
}

function CategoriesWindow({ categories, onCreate }: { categories: Category[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Gestion de categorias"
      description="Arbol de departamentos, navegacion, banners, SEO y reglas de visibilidad."
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><FolderTree className="mr-1 h-4 w-4" /> Nueva categoria</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="font-black">Arbol de catalogo</div>
          {categories.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No hay categorias cargadas.</p>}
          {categories.map((category) => (
            <div key={category.id} className="mt-2 flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-left text-sm font-bold">
              {category.name}
              <span className="text-muted-foreground">â€º</span>
            </div>
          ))}
        </div>
        <DataTable
          headers={["Categoria", "Slug", "Icono", "Imagen"]}
          rows={categories.map((category) => [
            category.name,
            category.slug,
            category.icon ?? "",
            category.image ?? "",
          ])}
          empty="No hay categorias cargadas"
        />
      </div>
    </WindowFrame>
  );
}

type MediaUploadLog = {
  file: string;
  status: "ok" | "skipped" | "error";
  detail: string;
};

function ProductMediaWindow({
  products,
  categories,
  images,
  categoryImages,
  banners,
}: {
  products: Product[];
  categories: Category[];
  images: DbRecord[];
  categoryImages: DbRecord[];
  banners: DbRecord[];
}) {
  const [localImages, setLocalImages] = useState(images);
  const [localCategoryImages, setLocalCategoryImages] = useState(categoryImages);
  const [localBanners, setLocalBanners] = useState(banners);
  const [bannerDesktopFile, setBannerDesktopFile] = useState<File | null>(null);
  const [bannerMobileFile, setBannerMobileFile] = useState<File | null>(null);
  const [bannerForm, setBannerForm] = useState({
    title: "",
    subtitle: "",
    placement: "home_slider" as BannerPlacement,
    destinationType: "none",
    categoryId: "",
    productId: "",
    pageUrl: "/",
    sort_order: "0",
  });
  const [categoryId, setCategoryId] = useState("");
  const [categoryFile, setCategoryFile] = useState<File | null>(null);
  const [productId, setProductId] = useState("");
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadLogs, setUploadLogs] = useState<MediaUploadLog[]>([]);
  const [openMediaSection, setOpenMediaSection] = useState<"banners" | "categories" | "products" | "zip" | "published" | "storage">("banners");

  useEffect(() => setLocalImages(images), [images]);
  useEffect(() => setLocalCategoryImages(categoryImages), [categoryImages]);
  useEffect(() => setLocalBanners(banners), [banners]);

  const selectedProduct = products.find((product) => product.id === productId);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const selectedBannerPlacement = BANNER_PLACEMENTS[bannerForm.placement];

  const bannerTargetUrl = (() => {
    if (bannerForm.destinationType === "category") {
      const category = categories.find((item) => item.id === bannerForm.categoryId);
      return category ? `/c/${category.slug}` : null;
    }
    if (bannerForm.destinationType === "product") {
      const product = products.find((item) => item.id === bannerForm.productId);
      return product ? `/p/${product.slug}` : null;
    }
    if (bannerForm.destinationType === "page") return bannerForm.pageUrl;
    return null;
  })();

  const pushLog = (entry: MediaUploadLog) => {
    setUploadLogs((current) => [entry, ...current].slice(0, 60));
  };

  const insertProductImage = async (product: Product, file: File, sortOrder: number, isPrimary: boolean) => {
    const uploaded = await uploadAdminMediaFile({
      bucket: MEDIA_BUCKETS.products,
      file,
      folder: `products/${product.sku}`,
    });
    const alt = `${product.name} ${sortOrder + 1}`;
    const response = await invokeAdminOperation({
      action: "create_product_image",
      product_id: product.id,
      url: uploaded.publicUrl,
      image_url: uploaded.publicUrl,
      storage_path: uploaded.storagePath,
      alt,
      alt_text: alt,
      sort_order: sortOrder,
      is_primary: isPrimary,
    });
    const data = response.image as DbRecord | undefined;
    setLocalImages((current) => (data ? [data, ...current] : current));
    return uploaded.publicUrl;
  };

  const uploadFilesForProduct = async (product: Product, files: File[], source: string) => {
    const existingCount = localImages.filter((image) => asText(image, "product_id") === product.id).length;
    const uploadedUrls: string[] = [];
    for (const [index, file] of files.entries()) {
      if (!isSupportedImageName(file.name)) {
        pushLog({ file: file.name, status: "skipped", detail: "Formato no permitido" });
        continue;
      }
      const url = await insertProductImage(product, file, existingCount + index, existingCount === 0 && index === 0);
      uploadedUrls.push(url);
      pushLog({ file: file.name, status: "ok", detail: `${source}: asignado a ${product.sku}` });
    }
    return uploadedUrls.length;
  };

  const handleBannerSubmit = async () => {
    if (!bannerDesktopFile || !bannerForm.title.trim()) {
      toast.error("Faltan datos", { description: "Carga la imagen desktop y escribe un titulo comercial." });
      return;
    }
    if (bannerForm.destinationType !== "none" && !bannerTargetUrl) {
      toast.error("Destino incompleto", { description: "Selecciona a donde debe llevar el banner." });
      return;
    }
    setUploading("banner");
    try {
      const desktopUpload = await uploadAdminMediaFile({
        bucket: MEDIA_BUCKETS.banners,
        file: bannerDesktopFile,
        folder: `banners/${bannerForm.placement}/desktop`,
      });
      const mobileUpload = bannerMobileFile
        ? await uploadAdminMediaFile({
            bucket: MEDIA_BUCKETS.banners,
            file: bannerMobileFile,
            folder: `banners/${bannerForm.placement}/mobile`,
          })
        : null;
      const { data, error } = await adminFrom("promotional_banners")
        .insert({
          title: bannerForm.title.trim(),
          subtitle: bannerForm.subtitle.trim() || null,
          image_url: desktopUpload.publicUrl,
          desktop_image_url: desktopUpload.publicUrl,
          mobile_image_url: mobileUpload?.publicUrl ?? desktopUpload.publicUrl,
          storage_path: desktopUpload.storagePath,
          desktop_storage_path: desktopUpload.storagePath,
          mobile_storage_path: mobileUpload?.storagePath ?? null,
          target_url: bannerTargetUrl,
          placement: bannerForm.placement,
          sort_order: Number(bannerForm.sort_order || 0),
          is_active: true,
        })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setLocalBanners((current) => [data, ...current]);
      setBannerDesktopFile(null);
      setBannerMobileFile(null);
      setBannerForm({
        title: "",
        subtitle: "",
        placement: "home_slider",
        destinationType: "none",
        categoryId: "",
        productId: "",
        pageUrl: "/",
        sort_order: "0",
      });
      toast.success("Slider guardado", { description: "El banner ya queda disponible para el ecommerce." });
    } catch (error) {
      toast.error("No se pudo guardar el slider", { description: (error as Error).message });
    } finally {
      setUploading(null);
    }
  };

  const handleCategorySubmit = async () => {
    if (!selectedCategory || !categoryFile) {
      toast.error("Faltan datos", { description: "Selecciona una categoria y una imagen." });
      return;
    }
    setUploading("category");
    try {
      const uploaded = await uploadAdminMediaFile({
        bucket: MEDIA_BUCKETS.categories,
        file: categoryFile,
        folder: `categories/${selectedCategory.slug}`,
      });
      const { error: updateError } = await adminFrom("categories").update({ image: uploaded.publicUrl }).eq("id", selectedCategory.id);
      if (updateError) throw updateError;
      const { data, error } = await adminFrom("category_images")
        .insert({
          category_id: selectedCategory.id,
          image_url: uploaded.publicUrl,
          storage_path: uploaded.storagePath,
          image_type: "banner",
          alt_text: selectedCategory.name,
          sort_order: 0,
        })
        .select("*")
        .single();
      if (error) throw error;
      if (data) setLocalCategoryImages((current) => [data, ...current]);
      setCategoryFile(null);
      toast.success("Categoria actualizada", { description: "La imagen queda enlazada al departamento." });
    } catch (error) {
      toast.error("No se pudo guardar la categoria", { description: (error as Error).message });
    } finally {
      setUploading(null);
    }
  };

  const handleProductSubmit = async () => {
    if (!selectedProduct || productFiles.length === 0) {
      toast.error("Faltan datos", { description: "Selecciona un producto y una o mas imagenes." });
      return;
    }
    setUploading("product");
    try {
      const count = await uploadFilesForProduct(selectedProduct, productFiles, "Carga individual");
      setProductFiles([]);
      toast.success("Imagenes guardadas", { description: `${count} imagen(es) asignadas a ${selectedProduct.sku}.` });
    } catch (error) {
      toast.error("No se pudieron guardar las imagenes", { description: (error as Error).message });
    } finally {
      setUploading(null);
    }
  };

  const handleZipSubmit = async () => {
    if (!zipFile) {
      toast.error("Selecciona un ZIP");
      return;
    }
    setUploading("zip");
    setUploadLogs([]);
    try {
      await uploadAdminMediaFile({
        bucket: MEDIA_BUCKETS.bulkImports,
        file: zipFile,
        folder: `bulk-imports/${new Date().toISOString().slice(0, 10)}`,
      });
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && isSupportedImageName(entry.name));
      let processed = 0;
      for (const entry of entries) {
        const product = matchProductByImageName(entry.name, products);
        if (!product) {
          pushLog({ file: entry.name, status: "skipped", detail: "No encontro SKU/ItemCode en catalogo" });
          continue;
        }
        try {
          const blob = await entry.async("blob");
          const file = new File([blob], leafName(entry.name), { type: inferMimeType(entry.name) });
          processed += await uploadFilesForProduct(product, [file], "ZIP");
        } catch (error) {
          pushLog({ file: entry.name, status: "error", detail: (error as Error).message });
        }
      }
      setZipFile(null);
      toast.success("ZIP procesado", { description: `${processed} imagen(es) asignadas. Revisa el log para omitidas.` });
    } catch (error) {
      toast.error("No se pudo procesar el ZIP", { description: (error as Error).message });
    } finally {
      setUploading(null);
    }
  };

  const updateBannerStatus = async (banner: DbRecord, isActive: boolean) => {
    try {
      const { error } = await adminFrom("promotional_banners").update({ is_active: isActive }).eq("id", asText(banner, "id"));
      if (error) throw error;
      setLocalBanners((current) =>
        current.map((item) => (asText(item, "id") === asText(banner, "id") ? { ...item, is_active: isActive } : item)),
      );
      toast.success(isActive ? "Banner activado" : "Banner pausado");
    } catch (error) {
      toast.error("No se pudo actualizar el banner", { description: (error as Error).message });
    }
  };

  const deleteBanner = async (banner: DbRecord) => {
    try {
      const { error } = await adminFrom("promotional_banners").delete().eq("id", asText(banner, "id"));
      if (error) throw error;
      setLocalBanners((current) => current.filter((item) => asText(item, "id") !== asText(banner, "id")));
      toast.success("Banner eliminado");
    } catch (error) {
      toast.error("No se pudo eliminar el banner", { description: (error as Error).message });
    }
  };

  return (
    <WindowFrame
      title="Imagenes y banners"
      description="Flujos guiados para marketing: sliders, categorias, galeria de producto y carga masiva."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-muted-foreground">Catalogo</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-bold text-muted-foreground">Imagenes y banners</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-black text-primary">
            {openMediaSection === "products"
              ? "Galeria de producto"
              : openMediaSection === "zip"
                ? "ZIP masivo por SKU"
                : openMediaSection === "categories"
                  ? "Imagen por categoria"
                  : openMediaSection === "published"
                    ? "Banners publicados"
                    : openMediaSection === "storage"
                      ? "Storage y log"
                      : "Sliders y banners"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <MediaStat label="Sliders" value={String(localBanners.length)} />
          <MediaStat label="Categorias con imagen" value={String(localCategoryImages.length)} />
          <MediaStat label="Fotos producto" value={String(localImages.length)} />
          <MediaStat label="Productos SAP" value={String(products.length)} />
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <AdminFlowSection
            icon={ImageIcon}
            title="Sliders y banners"
            description="Publica una promocion sin escribir rutas ni tocar Storage."
            meta={BANNER_PLACEMENTS[bannerForm.placement].desktop}
            open={openMediaSection === "banners"}
            onToggle={() => setOpenMediaSection(openMediaSection === "banners" ? "published" : "banners")}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <MediaInput label="Titulo">
                  <input value={bannerForm.title} onChange={(event) => setBannerForm((current) => ({ ...current, title: event.target.value }))} className="admin-input" placeholder="Ej. Semana de herramientas" />
                </MediaInput>
                <MediaInput label="Texto secundario">
                  <input value={bannerForm.subtitle} onChange={(event) => setBannerForm((current) => ({ ...current, subtitle: event.target.value }))} className="admin-input" placeholder="Opcional" />
                </MediaInput>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MediaInput label="Donde aparece">
                    <select
                      value={bannerForm.placement}
                      onChange={(event) => setBannerForm((current) => ({ ...current, placement: event.target.value as BannerPlacement }))}
                      className="admin-input"
                    >
                      {Object.entries(BANNER_PLACEMENTS).map(([value, preset]) => (
                        <option key={value} value={value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </MediaInput>
                  <MediaInput label="Orden">
                    <input type="number" value={bannerForm.sort_order} onChange={(event) => setBannerForm((current) => ({ ...current, sort_order: event.target.value }))} className="admin-input" />
                  </MediaInput>
                </div>
                <DimensionHint preset={selectedBannerPlacement} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <MediaInput label="Al hacer clic">
                    <select
                      value={bannerForm.destinationType}
                      onChange={(event) =>
                        setBannerForm((current) => ({
                          ...current,
                          destinationType: event.target.value,
                          categoryId: "",
                          productId: "",
                        }))
                      }
                      className="admin-input"
                    >
                      <option value="none">Sin enlace</option>
                      <option value="category">Abrir categoria</option>
                      <option value="product">Abrir producto</option>
                      <option value="page">Abrir pagina</option>
                    </select>
                  </MediaInput>
                  {bannerForm.destinationType === "category" && (
                    <MediaInput label="Categoria destino">
                      <select value={bannerForm.categoryId} onChange={(event) => setBannerForm((current) => ({ ...current, categoryId: event.target.value }))} className="admin-input">
                        <option value="">Seleccionar</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </MediaInput>
                  )}
                  {bannerForm.destinationType === "product" && (
                    <MediaInput label="Producto destino">
                      <select value={bannerForm.productId} onChange={(event) => setBannerForm((current) => ({ ...current, productId: event.target.value }))} className="admin-input">
                        <option value="">Seleccionar</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.sku} - {product.name}
                          </option>
                        ))}
                      </select>
                    </MediaInput>
                  )}
                  {bannerForm.destinationType === "page" && (
                    <MediaInput label="Pagina destino">
                      <select value={bannerForm.pageUrl} onChange={(event) => setBannerForm((current) => ({ ...current, pageUrl: event.target.value }))} className="admin-input">
                        {PAGE_DESTINATIONS.map((page) => (
                          <option key={page.value} value={page.value}>
                            {page.label}
                          </option>
                        ))}
                      </select>
                    </MediaInput>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MediaInput label={`Imagen desktop (${selectedBannerPlacement.desktop})`}>
                    <FilePicker
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      selectedLabel={bannerDesktopFile?.name}
                      onChange={(files) => setBannerDesktopFile(files[0] ?? null)}
                    />
                  </MediaInput>
                  <MediaInput label={`Imagen movil (${selectedBannerPlacement.mobile})`}>
                    <FilePicker
                      accept="image/png,image/jpeg,image/webp,image/avif"
                      selectedLabel={bannerMobileFile?.name ?? "Opcional; si falta se usa la desktop"}
                      onChange={(files) => setBannerMobileFile(files[0] ?? null)}
                    />
                  </MediaInput>
                </div>
                <Button type="button" onClick={handleBannerSubmit} disabled={uploading !== null} className={cn(ADMIN_SOFT_BUTTON_STRONG, "w-full")}>
                  {uploading === "banner" ? "Subiendo..." : "Publicar banner"}
                </Button>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="font-black">Como debe prepararse</div>
                <div className="mt-3 space-y-2 text-muted-foreground">
                  <ConfigRow label="Formato" value="PNG, JPG, WEBP, AVIF" />
                  <ConfigRow label="Peso ideal" value="Menos de 1.5 MB" />
                  <ConfigRow label="Texto" value="Corto, comercial" />
                  <ConfigRow label="Destino" value={bannerTargetUrl ?? "Sin enlace"} />
                </div>
              </div>
            </div>
          </AdminFlowSection>

          <AdminFlowSection
            icon={FolderTree}
            title="Imagen por categoria"
            description="Define la imagen visible para cada departamento del ecommerce."
            meta="900 x 620 px"
            open={openMediaSection === "categories"}
            onToggle={() => setOpenMediaSection(openMediaSection === "categories" ? "banners" : "categories")}
          >
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <DimensionHint
                preset={{
                  label: "Categoria",
                  hint: "Usa una foto clara del departamento.",
                  desktop: "900 x 620 px",
                  mobile: "900 x 900 px",
                  ratio: "4:3 o 1:1",
                }}
              />
              <div className="space-y-3">
                <MediaInput label="Categoria">
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="admin-input">
                    <option value="">Seleccionar categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </MediaInput>
                <FilePicker accept="image/png,image/jpeg,image/webp,image/avif" onChange={(files) => setCategoryFile(files[0] ?? null)} />
                <Button type="button" onClick={handleCategorySubmit} disabled={uploading !== null} className={cn(ADMIN_SOFT_BUTTON_STRONG, "w-full")}>
                  {uploading === "category" ? "Subiendo..." : "Guardar imagen de categoria"}
                </Button>
              </div>
            </div>
          </AdminFlowSection>

          <AdminFlowSection
            icon={Package}
            title="Galeria de producto"
            description="Agrega portada y fotos secundarias a productos importados desde SAP."
            meta="1200 x 1200 px"
            open={openMediaSection === "products"}
            onToggle={() => setOpenMediaSection(openMediaSection === "products" ? "banners" : "products")}
          >
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <DimensionHint
                preset={{
                  label: "Producto",
                  hint: "Fondo limpio, producto completo y sin texto promocional.",
                  desktop: "1200 x 1200 px",
                  mobile: "1200 x 1200 px",
                  ratio: "1:1",
                }}
              />
              <div className="space-y-3">
                <MediaInput label="Producto">
                  <select value={productId} onChange={(event) => setProductId(event.target.value)} className="admin-input">
                    <option value="">Seleccionar producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} - {product.name}
                      </option>
                    ))}
                  </select>
                </MediaInput>
                <FilePicker multiple accept="image/png,image/jpeg,image/webp,image/avif" onChange={setProductFiles} />
                <Button type="button" onClick={handleProductSubmit} disabled={uploading !== null} className={cn(ADMIN_SOFT_BUTTON_STRONG, "w-full")}>
                  {uploading === "product" ? "Subiendo..." : "Guardar imagenes de producto"}
                </Button>
              </div>
            </div>
            <div className="mt-5">
              <DataTable
                headers={["Producto", "Imagen", "ALT", "Orden", "Principal"]}
                rows={localImages.map((image) => [
                  asText(image, "product_id"),
                  asText(image, "url", asText(image, "image_url")),
                  asText(image, "alt", asText(image, "alt_text")),
                  asText(image, "sort_order", "0"),
                  asText(image, "is_primary"),
                ])}
                empty="No hay imagenes de producto configuradas"
              />
            </div>
          </AdminFlowSection>

          <AdminFlowSection
            icon={FileArchive}
            title="ZIP masivo por SKU"
            description="Carga muchas imagenes y asigna cada archivo por codigo SAP/SKU."
            meta="SKU.jpg"
            open={openMediaSection === "zip"}
            onToggle={() => setOpenMediaSection(openMediaSection === "zip" ? "banners" : "zip")}
          >
            <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-black">Formato obligatorio</div>
                <div className="mt-1">El archivo debe llamarse igual que el codigo SAP/SKU: ABC123.jpg, ABC123_2.png o ABC123-principal.webp.</div>
              </div>
              <div className="space-y-3">
                <FilePicker accept=".zip,application/zip,application/x-zip-compressed" onChange={(files) => setZipFile(files[0] ?? null)} />
                <Button type="button" onClick={handleZipSubmit} disabled={uploading !== null || products.length === 0} className={cn(ADMIN_SOFT_BUTTON_STRONG, "w-full")}>
                  {uploading === "zip" ? "Procesando ZIP..." : "Procesar ZIP"}
                </Button>
                {products.length === 0 && <p className="text-xs text-destructive">Carga productos SAP antes de importar imagenes por ZIP.</p>}
              </div>
            </div>
          </AdminFlowSection>

          <AdminFlowSection
            icon={Eye}
            title="Banners publicados"
            description="Pausa, activa o elimina promociones visibles en tienda."
            meta={`${localBanners.length} registro(s)`}
            open={openMediaSection === "published"}
            onToggle={() => setOpenMediaSection(openMediaSection === "published" ? "banners" : "published")}
          >
            <div className="space-y-3">
              {localBanners.length === 0 ? (
                <EmptyAdminState label="No hay banners cargados" />
              ) : (
                localBanners.map((banner) => {
                  const placement = asText(banner, "placement", "home_slider") as BannerPlacement;
                  const preset = BANNER_PLACEMENTS[placement] ?? BANNER_PLACEMENTS.home_slider;
                  const active = asText(banner, "is_active") === "true";
                  const desktopImage = asText(banner, "desktop_image_url", asText(banner, "image_url"));
                  const mobileImage = asText(banner, "mobile_image_url", desktopImage);
                  return (
                    <div key={asText(banner, "id")} className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-[180px_1fr_auto]">
                      <div className="grid grid-cols-[1fr_56px] gap-2">
                        <img src={desktopImage} alt="" className="h-24 w-full rounded-md bg-white object-cover" />
                        <img src={mobileImage} alt="" className="h-24 w-14 rounded-md bg-white object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-1 font-black">{asText(banner, "title")}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{preset.label} - Orden {asText(banner, "sort_order", "0")}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{asText(banner, "target_url", "Sin enlace")}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => updateBannerStatus(banner, !active)} className="flex-1">
                          {active ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                          {active ? "Pausar" : "Activar"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => deleteBanner(banner)} className="text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </AdminFlowSection>

          <AdminFlowSection
            icon={CheckCircle2}
            title="Storage y log de cargas"
            description="Estado tecnico resumido para soporte."
            meta="Supabase Storage"
            open={openMediaSection === "storage"}
            onToggle={() => setOpenMediaSection(openMediaSection === "storage" ? "banners" : "storage")}
          >
            <div className="mb-4 grid gap-2 text-sm md:grid-cols-4">
              <ConfigRow label="Productos" value="product-media" />
              <ConfigRow label="Categorias" value="category-media" />
              <ConfigRow label="Sliders" value="banner-media" />
              <ConfigRow label="ZIP original" value={MEDIA_BUCKETS.bulkImports} />
            </div>
            <div className="flex items-center gap-2 font-black">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Log de carga
            </div>
            <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {uploadLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cargas recientes.</p>
              ) : (
                uploadLogs.map((item, index) => (
                  <div key={`${item.file}-${index}`} className="rounded-md border border-border bg-white p-2 text-xs">
                    <div className="truncate font-black">{item.file}</div>
                    <div className={item.status === "ok" ? "text-emerald-700" : item.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                      {item.detail}
                    </div>
                  </div>
                ))
              )}
            </div>
          </AdminFlowSection>
        </div>
      </div>
    </WindowFrame>
  );
}

function AdminFlowSection({
  title,
  description,
  icon: Icon,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Activity;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-primary/5 md:px-5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-black">{title}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {meta && <BadgeLike label={meta} />}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180 text-primary")} />
      </button>
      {open && <div className="border-t border-border bg-white px-4 py-5 md:px-5">{children}</div>}
    </section>
  );
}

function MediaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-border bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-2 font-black text-foreground">{value}</span>
    </div>
  );
}

function DimensionHint({
  preset,
}: {
  preset: { label: string; hint: string; desktop: string; mobile: string; ratio: string };
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-black text-primary">{preset.label}</div>
          <p className="text-xs text-muted-foreground">{preset.hint}</p>
        </div>
        <BadgeLike label={preset.ratio} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <ConfigRow label="Desktop" value={preset.desktop} />
        <ConfigRow label="Movil" value={preset.mobile} />
      </div>
    </div>
  );
}

function BadgeLike({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-muted-foreground shadow-sm">
      {label}
    </span>
  );
}

function MediaInput({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function FilePicker({
  accept,
  multiple,
  selectedLabel,
  onChange,
}: {
  accept: string;
  multiple?: boolean;
  selectedLabel?: string;
  onChange: (files: File[]) => void;
}) {
  return (
    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-center text-sm hover:border-primary/60">
      <Upload className="h-5 w-5 text-primary" />
      <span className="mt-2 font-bold">Seleccionar archivo{multiple ? "s" : ""}</span>
      <span className="text-xs text-muted-foreground">{selectedLabel || `PNG, JPG, WEBP, AVIF${accept.includes("zip") ? " o ZIP" : ""}`}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => onChange(Array.from(event.currentTarget.files ?? []))}
      />
    </label>
  );
}

function VariantsWindow({ variants, onCreate }: { products: Product[]; variants: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Variantes de producto"
      description="SKUs hijos por color, tamano, presentacion, codigo de barras, precio e imagen."
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Tags className="mr-1 h-4 w-4" /> Nueva variante</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Producto padre", "SKU variante", "Atributos", "Precio", "Estado"]}
        rows={variants.map((variant) => [
          asText(variant, "product_id"),
          asText(variant, "sku"),
          JSON.stringify(variant.attributes ?? {}),
          formatMaybePrice(variant.price_delta),
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
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Tags className="mr-1 h-4 w-4" /> Nueva lista</Button>}
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

function InventoryWindow({
  products,
  stores,
  inventory,
  onReserve,
}: {
  products: Product[];
  stores: StoreType[];
  inventory: DbRecord[];
  onReserve: () => void;
}) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const storeTotals = stores.map((store) => ({
    store,
    qty: inventory
      .filter((item) => asText(item, "store_id") === store.id)
      .reduce((sum, item) => sum + asNumber(item, "on_hand", asNumber(item, "qty")), 0),
  }));
  const rows = inventory.map((item) => {
    const available =
      asNumber(
        item,
        "available_ecommerce",
        Math.max(
          asNumber(item, "on_hand", asNumber(item, "qty")) -
            asNumber(item, "committed") -
            asNumber(item, "reserved_ecommerce") -
            asNumber(item, "safety_stock"),
          0,
        ),
      );
    return [
      storeById.get(asText(item, "store_id"))?.name ?? asText(item, "store_id"),
      productById.get(asText(item, "product_id"))?.sku ?? asText(item, "product_id"),
      asText(item, "on_hand", asText(item, "qty", "0")),
      asText(item, "committed", "0"),
      asText(item, "reserved_ecommerce", "0"),
      asText(item, "safety_stock", "0"),
      String(available),
    ];
  });

  return (
    <WindowFrame
      title="Inventario"
      description="Existencias por tienda, stock reservado, bajo stock y disponibilidad para ecommerce."
      actions={<Button onClick={onReserve} className={ADMIN_SOFT_BUTTON}><Boxes className="mr-1 h-4 w-4" /> Reservar stock</Button>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {storeTotals.slice(0, 4).map(({ store, qty }) => (
          <MetricCard key={store.id} label={store.name} value={`${qty} uds`} />
        ))}
      </div>
      <DataTable
        headers={["Tienda", "SKU", "On hand", "Comprometido", "Reservado", "Safety", "Disponible ecommerce"]}
        rows={rows}
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
  const [expiring, setExpiring] = useState(false);
  const totalStock = inventory.reduce((sum, item) => sum + asNumber(item, "on_hand", asNumber(item, "qty")), 0);
  const committed = inventory.reduce((sum, item) => sum + asNumber(item, "committed"), 0);
  const reserved = inventory.reduce((sum, item) => sum + asNumber(item, "reserved_ecommerce"), 0);
  const incoming = inventory.reduce((sum, item) => sum + asNumber(item, "incoming"), 0);

  const expireReservations = async () => {
    setExpiring(true);
    try {
      const response = await invokeAdminOperation({ action: "expire_inventory_reservations" });
      toast.success("Reservas vencidas procesadas", { description: `${String(response.expired ?? 0)} reserva(s) actualizadas.` });
    } catch (error) {
      toast.error("No se pudieron expirar reservas", { description: (error as Error).message });
    } finally {
      setExpiring(false);
    }
  };

  return (
    <WindowFrame
      title="Stock realtime por tienda"
      description="On hand, comprometido, reservado ecommerce, incoming, disponible y reservas con expiracion."
      actions={
        <>
          <Button onClick={expireReservations} disabled={expiring} className={ADMIN_SOFT_BUTTON}>
            <Activity className="mr-1 h-4 w-4" /> {expiring ? "Procesando..." : "Expirar vencidas"}
          </Button>
          <Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Activity className="mr-1 h-4 w-4" /> Reservar stock</Button>
        </>
      }
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
          asText(
            item,
            "available_ecommerce",
            String(
              Math.max(
                asNumber(item, "on_hand", asNumber(item, "qty")) -
                  asNumber(item, "committed") -
                  asNumber(item, "reserved_ecommerce") -
                  asNumber(item, "safety_stock"),
                0,
              ),
            ),
          ),
        ])}
        empty="No hay niveles de stock"
      />
    </WindowFrame>
  );
}

function OrdersWindow({
  orders,
  orderItems,
  orderStatusHistory,
  payments,
  reservations,
}: {
  orders: DbRecord[];
  orderItems: DbRecord[];
  orderStatusHistory: DbRecord[];
  payments: DbRecord[];
  reservations: DbRecord[];
}) {
  const headers = ["Pedido", "Cliente", "Canal", "Pago", "Entrega", "Total", "Estado"];
  const rows = orders.map((order) => [
    asText(order, "id"),
    asText(order, "customer_name", asText(order, "user_id")),
    asText(order, "channel"),
    asText(order, "payment_status"),
    asText(order, "shipping_status"),
    formatMaybePrice(order.total),
    asText(order, "status"),
  ]);

  const exportOrders = () => {
    if (rows.length === 0) {
      toast.info("No hay pedidos para exportar");
      return;
    }
    downloadCsv("renova-pedidos.csv", headers, rows);
    toast.success("Pedidos exportados", { description: "Se genero un CSV con la vista actual de pedidos." });
  };

  return (
    <WindowFrame
      title="Gestion de pedidos"
      description="Pedidos web, retiro en tienda, despacho, pagos, facturacion y estados."
      actions={<Button onClick={exportOrders} variant="outline"><FileText className="mr-1 h-4 w-4" /> Exportar CSV</Button>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Pedidos" value={String(orders.length)} />
        <MetricCard label="Items" value={String(orderItems.length)} />
        <MetricCard label="Pagos" value={String(payments.length)} />
        <MetricCard label="Reservas" value={String(reservations.length)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <Toolbar />
          <DataTable headers={headers} rows={rows} empty="No hay pedidos registrados" />
          <DataTable
            headers={["Pedido", "SKU", "Producto", "Cantidad", "Precio"]}
            rows={orderItems.map((item) => [
              asText(item, "order_id"),
              asText(item, "sku"),
              asText(item, "name", asText(item, "product_name")),
              asText(item, "qty", asText(item, "quantity", "0")),
              formatMaybePrice(item.price ?? item.unit_price),
            ])}
            empty="No hay items de pedido"
          />
        </div>
        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-black">Pagos y reservas</h3>
            <div className="mt-3 space-y-2">
              {payments.slice(0, 8).map((payment) => (
                <div key={asText(payment, "id")} className="rounded-lg bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black">{asText(payment, "gateway", asText(payment, "provider", "Pago"))}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-black text-primary">{asText(payment, "status")}</span>
                  </div>
                  <ConfigRow label="Pedido" value={asText(payment, "order_id")} />
                  <ConfigRow label="Monto" value={formatMaybePrice(payment.amount)} />
                </div>
              ))}
              {payments.length === 0 && <EmptyAdminState label="Sin pagos registrados" />}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-black">Historial de estado</h3>
            <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
              {orderStatusHistory.map((item) => (
                <div key={asText(item, "id", `${asText(item, "order_id")}-${formatDate(item)}`)} className="rounded-lg bg-white p-3 text-sm">
                  <div className="font-black">{asText(item, "status")}</div>
                  <div className="text-xs text-muted-foreground">{asText(item, "order_id")}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDate(item)} {asText(item, "notes")}</div>
                </div>
              ))}
              {orderStatusHistory.length === 0 && <EmptyAdminState label="Sin historial de estados" />}
            </div>
          </section>
        </div>
      </div>
    </WindowFrame>
  );
}

function RecoveryWindow({ tasks, queue }: { tasks: DbRecord[]; queue: DbRecord[] }) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [localQueue, setLocalQueue] = useState(queue);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setLocalTasks(tasks), [tasks]);
  useEffect(() => setLocalQueue(queue), [queue]);

  const resolveTask = async (task: DbRecord) => {
    const taskId = asText(task, "id");
    setBusyId(taskId);
    try {
      await invokeAdminOperation({ action: "resolve_recovery_task", task_id: taskId });
      setLocalTasks((current) => current.map((item) => (asText(item, "id") === taskId ? { ...item, status: "resolved" } : item)));
      toast.success("Tarea resuelta", { description: asText(task, "title", taskId) });
    } catch (error) {
      toast.error("No se pudo resolver", { description: (error as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const retryQueueEvent = async (item: DbRecord) => {
    const eventId = asText(item, "id");
    setBusyId(eventId);
    try {
      await invokeAdminOperation({ action: "retry_integration_event", event_id: eventId });
      setLocalQueue((current) => current.map((event) => (asText(event, "id") === eventId ? { ...event, status: "pending", last_error: null } : event)));
      toast.success("Evento reprogramado", { description: asText(item, "event_type") });
    } catch (error) {
      toast.error("No se pudo reprogramar", { description: (error as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const openTasks = localTasks.filter((item) => !["resolved", "closed"].includes(asText(item, "status")));
  const failedQueue = localQueue.filter((item) => ["failed", "retrying"].includes(asText(item, "status")));

  return (
    <WindowFrame
      title="Recuperacion critica"
      description="Errores de integracion, checkout, pagos, facturacion e inventario que requieren retry o accion manual."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Abiertas" value={String(openTasks.length)} />
        <MetricCard label="Criticas" value={String(localTasks.filter((item) => asText(item, "severity") === "critical").length)} />
        <MetricCard label="Cola con error" value={String(failedQueue.length)} />
        <MetricCard label="Total tareas" value={String(localTasks.length)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="border-b border-border bg-surface px-4 py-3">
            <h3 className="font-black">Tareas de recuperacion</h3>
          </div>
          <div className="divide-y divide-border">
            {localTasks.length === 0 && <EmptyAdminState label="No hay tareas de recuperacion" />}
            {localTasks.map((task) => {
              const taskId = asText(task, "id");
              return (
                <div key={taskId} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black">{asText(task, "title", asText(task, "task_type", "Tarea"))}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-black", asText(task, "severity") === "critical" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                        {asText(task, "severity", "high")}
                      </span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-black">{asText(task, "status")}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{asText(task, "error_message", asText(task, "error"))}</p>
                    <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
                      <ConfigRow label="Scope" value={asText(task, "scope")} />
                      <ConfigRow label="Entidad" value={`${asText(task, "entity_type")} ${asText(task, "entity_id")}`.trim()} />
                      <ConfigRow label="Idempotencia" value={asText(task, "idempotency_key")} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={busyId === taskId || ["resolved", "closed"].includes(asText(task, "status"))}
                    onClick={() => resolveTask(task)}
                    className={ADMIN_SOFT_BUTTON}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Resolver
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="font-black">Reintentos de cola</h3>
          <p className="mt-1 text-sm text-muted-foreground">Reprograma eventos de `integration_event_queue` que quedaron en failed/retrying.</p>
          <div className="mt-4 space-y-3">
            {failedQueue.length === 0 && <EmptyAdminState label="Sin eventos fallidos" />}
            {failedQueue.map((event) => {
              const eventId = asText(event, "id");
              return (
                <div key={eventId} className="rounded-lg bg-white p-3 text-sm">
                  <div className="font-black">{asText(event, "event_type")}</div>
                  <ConfigRow label="Entidad" value={`${asText(event, "aggregate_type")} ${asText(event, "aggregate_id")}`.trim()} />
                  <ConfigRow label="Intentos" value={asText(event, "attempts", "0")} />
                  <Button type="button" disabled={busyId === eventId} onClick={() => retryQueueEvent(event)} className={cn(ADMIN_SOFT_BUTTON, "mt-3 w-full")}>
                    <Activity className="mr-1 h-4 w-4" /> Reprogramar
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}

function ShippingWindow({ stores, methods, onCreate }: { stores: StoreType[]; methods: DbRecord[]; onCreate: () => void }) {
  return (
    <WindowFrame
      title="Gestion de envios"
      description="Zonas, tarifas, transportistas, tiempos de entrega, pickup y reglas por sucursal."
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Truck className="mr-1 h-4 w-4" /> Nueva regla</Button>}
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
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Save className="mr-1 h-4 w-4" /> Nueva regla</Button>}
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
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Truck className="mr-1 h-4 w-4" /> Solicitar guia</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable
            headers={["Pedido", "Tracking", "Peso", "Volumetrico", "Cotizacion", "Estado"]}
            rows={shipments.map((shipment) => [
              asText(shipment, "order_id"),
              asText(shipment, "tracking_number"),
              asText(shipment, "weight_kg"),
              asText(shipment, "volumetric_weight"),
              formatMaybePrice(shipment.cost),
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
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><Users className="mr-1 h-4 w-4" /> Nuevo B2C</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Email", "Nombre", "Tipo", "Estado", "Lista de precios"]}
        rows={rows.map((item) => [
          asText(item, "email"),
          asText(item, "card_name"),
          asText(item, "customer_type"),
          asText(item, "is_active"),
          asText(item, "price_list"),
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
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><ShieldCheck className="mr-1 h-4 w-4" /> Nuevo B2B</Button>}
    >
      <Toolbar />
      <DataTable
        headers={["Email", "Empresa", "Tipo", "Estado", "Lista de precios"]}
        rows={rows.map((item) => [
          asText(item, "email"),
          asText(item, "card_name"),
          asText(item, "customer_type"),
          asText(item, "is_active"),
          asText(item, "price_list"),
        ])}
      />
    </WindowFrame>
  );
}

function PaymentsWindow({
  rows,
  events,
  payments,
  onCreate,
}: {
  rows: DbRecord[];
  events: DbRecord[];
  payments: DbRecord[];
  onCreate: () => void;
}) {
  return (
    <WindowFrame
      title="Pasarelas de pago"
      description="Configura procesadores, ambiente, llaves API, cuotas, metodos disponibles y reglas por monto."
      actions={<Button onClick={onCreate} className={ADMIN_SOFT_BUTTON}><CreditCard className="mr-1 h-4 w-4" /> Agregar pasarela</Button>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Pasarelas" value={String(rows.length)} />
        <MetricCard label="Pagos" value={String(payments.length)} />
        <MetricCard label="Eventos" value={String(events.length)} />
        <MetricCard label="Aprobados" value={String(events.filter((event) => asText(event, "event_type").includes("approved")).length)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-4 md:grid-cols-2">
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
                <ConfigRow label="Cuotas" value={asText(gateway, "supports_installments") === "true" ? "Habilitadas" : "No habilitadas"} />
                <ConfigRow label="Webhook" value={asText(gateway, "webhook_url")} />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <DataTable
            headers={["Pedido", "Gateway", "Monto", "Estado"]}
            rows={payments.slice(0, 12).map((payment) => [
              asText(payment, "order_id"),
              asText(payment, "gateway", asText(payment, "provider")),
              formatMaybePrice(payment.amount),
              asText(payment, "status"),
            ])}
            empty="No hay pagos registrados"
          />
          <DataTable
            headers={["Evento", "Pedido", "Idempotencia", "Estado"]}
            rows={events.slice(0, 12).map((event) => [
              asText(event, "event_type"),
              asText(event, "order_id"),
              asText(event, "idempotency_key"),
              asText(event, "status"),
            ])}
            empty="No hay eventos de pago"
          />
        </div>
      </div>
    </WindowFrame>
  );
}

function settingValue(settings: DbRecord[], key: string) {
  const row = settings.find((item) => asText(item, "key") === key);
  return row?.value as DbRecord | undefined;
}

function SapMiddlewareWindow({
  queue,
  sapEvents,
  idempotencyKeys,
  mappings,
  syncLogs,
  settings,
}: {
  queue: DbRecord[];
  sapEvents: DbRecord[];
  idempotencyKeys: DbRecord[];
  mappings: DbRecord[];
  syncLogs: DbRecord[];
  settings: DbRecord[];
}) {
  const [localQueue, setLocalQueue] = useState(queue);
  const [busyId, setBusyId] = useState<string | null>(null);
  const sapGate = settingValue(settings, "orders_ready_for_sap_enabled");
  const gateEnabled = sapGate?.enabled === true;

  useEffect(() => setLocalQueue(queue), [queue]);

  const retryQueueEvent = async (item: DbRecord) => {
    const eventId = asText(item, "id");
    setBusyId(eventId);
    try {
      await invokeAdminOperation({ action: "retry_integration_event", event_id: eventId });
      setLocalQueue((current) => current.map((event) => (asText(event, "id") === eventId ? { ...event, status: "pending", last_error: null } : event)));
      toast.success("Evento SAP reprogramado", { description: asText(item, "event_type") });
    } catch (error) {
      toast.error("No se pudo reprogramar", { description: (error as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <WindowFrame
      title="SAP Middleware"
      description="Cola de sincronizacion, eventos inbound, idempotencia, mappings, logs y gate controlado para SAP."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        <MetricCard label="Outbound queue" value={String(localQueue.length)} />
        <MetricCard label="Inbound SAP" value={String(sapEvents.length)} />
        <MetricCard label="Idempotencia" value={String(idempotencyKeys.length)} />
        <MetricCard label="Mappings" value={String(mappings.length)} />
        <MetricCard label="Gate SAP" value={gateEnabled ? "Activo" : "Bloqueado"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <DataTable
            headers={["Evento outbound", "Entidad", "Intentos", "Programado", "Estado"]}
            rows={localQueue.map((item) => [
              asText(item, "event_type"),
              `${asText(item, "aggregate_type")} ${asText(item, "aggregate_id")}`.trim(),
              asText(item, "attempts", "0"),
              formatDate(item, "scheduled_at"),
              asText(item, "status"),
            ])}
            empty="No hay eventos outbound"
          />
          <DataTable
            headers={["Evento inbound", "Source", "Procesadas", "Fallidas", "Estado"]}
            rows={sapEvents.map((event) => [
              asText(event, "event_type"),
              asText(event, "source"),
              asText(event, "processed_rows", "0"),
              asText(event, "failed_rows", "0"),
              asText(event, "status"),
            ])}
            empty="No hay eventos SAP recibidos"
          />
          <DataTable
            headers={["Entidad", "RENOVA ID", "Objeto SAP", "DocNum", "Actualizado"]}
            rows={mappings.map((mapping) => [
              asText(mapping, "entity_type"),
              asText(mapping, "entity_id"),
              asText(mapping, "sap_object_type"),
              asText(mapping, "sap_doc_num"),
              formatDate(mapping, "updated_at"),
            ])}
            empty="No hay mappings SAP"
          />
        </div>

        <div className="space-y-4">
          <section className={cn("rounded-xl border p-4", gateEnabled ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
            <div className="flex items-center gap-2 font-black">
              <ShieldCheck className={cn("h-5 w-5", gateEnabled ? "text-emerald-700" : "text-amber-700")} />
              Gate orders.ready_for_sap
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {gateEnabled
                ? "El backend puede emitir eventos para crear documentos SAP."
                : "Bloqueado a proposito: orders.ready_for_sap e invoice.create_requested se convierten en eventos gate_blocked."}
            </p>
            <div className="mt-3 space-y-2">
              <ConfigRow label="Estado" value={gateEnabled ? "enabled=true" : "enabled=false"} />
              <ConfigRow label="Razon" value={String(sapGate?.reason ?? "Sin detalle")} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-black">Reintentos manuales</h3>
            <div className="mt-3 space-y-3">
              {localQueue.filter((item) => ["failed", "retrying"].includes(asText(item, "status"))).length === 0 && (
                <EmptyAdminState label="Sin eventos fallidos" />
              )}
              {localQueue
                .filter((item) => ["failed", "retrying"].includes(asText(item, "status")))
                .slice(0, 8)
                .map((item) => {
                  const eventId = asText(item, "id");
                  return (
                    <div key={eventId} className="rounded-lg bg-white p-3 text-sm">
                      <div className="font-black">{asText(item, "event_type")}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{asText(item, "last_error")}</p>
                      <Button type="button" disabled={busyId === eventId} onClick={() => retryQueueEvent(item)} className={cn(ADMIN_SOFT_BUTTON, "mt-3 w-full")}>
                        <Activity className="mr-1 h-4 w-4" /> Reprogramar
                      </Button>
                    </div>
                  );
                })}
            </div>
          </section>

          <DataTable
            headers={["Key", "Scope", "Estado", "Actualizado"]}
            rows={idempotencyKeys.slice(0, 10).map((item) => [
              asText(item, "key"),
              asText(item, "scope"),
              asText(item, "status"),
              formatDate(item, "updated_at"),
            ])}
            empty="Sin idempotency keys visibles"
          />
          <DataTable
            headers={["Tipo", "Entidad", "Estado", "Fecha"]}
            rows={syncLogs.slice(0, 10).map((item) => [
              asText(item, "sync_type", asText(item, "entity_type")),
              asText(item, "entity_id"),
              asText(item, "status"),
              formatDate(item),
            ])}
            empty="Sin sap_sync_logs"
          />
        </div>
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
  const now = Date.now();
  const expiringReservations = data.records.inventoryReservations.filter((item) => {
    const status = asText(item, "status");
    const expiresAt = asDate(item, "expires_at");
    if (!expiresAt || status !== "reserved") return false;
    return expiresAt.getTime() <= now + 30 * 60 * 1000;
  });
  const conversionFunnel = [
    { step: "Carritos", value: data.records.carts.length },
    { step: "Pedidos", value: orders.length },
    { step: "Facturas", value: data.records.invoices.length },
  ].filter((item) => item.value > 0);
  const alertRows = [
    ...data.records.recoveryTasks.filter((item) => ["open", "pending", "failed", "retrying", "in_progress"].includes(asText(item, "status"))).map((item) => ["Recuperacion", `${asText(item, "scope")} - ${asText(item, "status")}`, "danger"]),
    ...expiringReservations.map((item) => ["Reservas", `${asText(item, "order_id", asText(item, "product_id"))} vence ${formatDate(item, "expires_at")}`, (asDate(item, "expires_at")?.getTime() ?? Number.POSITIVE_INFINITY) < now ? "danger" : "warning"]),
    ...data.records.integrationQueue.filter((item) => ["failed", "retrying"].includes(asText(item, "status"))).map((item) => ["SAP", `${asText(item, "event_type")} - ${asText(item, "status")}`, "warning"]),
    ...data.records.shipments.filter((item) => !asText(item, "tracking_number")).map((item) => ["FORZA", `${asText(item, "order_id")} sin tracking`, "warning"]),
    ...data.products.filter((product) => product.stock <= 0).map((product) => ["Stock", `${product.sku} sin disponibilidad`, "danger"]),
    ...data.records.invoices.filter((item) => ["failed", "pending"].includes(asText(item, "status"))).map((item) => ["Facturacion", `${asText(item, "invoice_number")} ${asText(item, "status")}`, "info"]),
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-[#101827] p-5 text-white shadow-[var(--shadow-enterprise)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-primary">Analitica ecommerce</div>
            <h2 className="mt-2 text-2xl font-black">Dashboard ejecutivo de ventas</h2>
            <p className="mt-1 max-w-3xl text-sm text-white/60">
              Ventas, margen, conversion, canales, stock critico, cumplimiento logistico y salud SAP en una sola vista.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right text-xs md:grid-cols-4">
            <DashboardSignal label="SAP pendientes" value={String(data.records.integrationQueue.filter((item) => asText(item, "status") === "pending").length)} tone="text-amber-300" />
            <DashboardSignal label="Reservas criticas" value={String(expiringReservations.length)} tone="text-orange-300" />
            <DashboardSignal label="Envios abiertos" value={String(data.records.shipments.filter((item) => asText(item, "status") !== "delivered").length)} tone="text-emerald-300" />
            <DashboardSignal label="Alertas" value={String(alertRows.length)} tone="text-amber-300" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DashboardKpi label="Venta registrada" value={formatPrice(totalRevenue)} delta="Desde Supabase" />
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
                {channelMix.map((entry, index) => (
                  <Cell key={`${entry.name}-${entry.fill}-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            </PieChart>
          </ChartContainer>
          ) : <EmptyAdminState label="No hay canales de venta registrados" />}
          <div className="grid grid-cols-2 gap-2">
            {channelMix.map((channel, index) => (
              <div key={`${channel.name}-${channel.fill}-${index}`} className="rounded-lg border border-border bg-surface p-3">
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
              <div key={`${area}-${message}`} className="rounded-lg border border-border bg-surface p-3">
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

function PromotionHubWindow({ data, onCreate }: { data: AdminData; onCreate: (module?: AdminModule) => void }) {
  const rows = [
    ...data.records.marketingCampaigns.map((item) => [
      "Campana",
      asText(item, "name"),
      asText(item, "campaign_type"),
      asText(item, "status"),
    ]),
    ...data.records.couponRules.map((item) => [
      "Cupon",
      asText(item, "code"),
      `${asText(item, "discount_type")} ${asText(item, "discount_value")}`,
      asText(item, "is_active"),
    ]),
    ...data.records.banners.map((item) => [
      "Banner",
      asText(item, "title"),
      asText(item, "placement"),
      asText(item, "is_active"),
    ]),
  ];

  return (
    <WindowFrame
      title="Promociones"
      description="Centro de reglas comerciales para cupones, flash sales, banners, recomendaciones y carritos abandonados."
      actions={
        <>
          <Button onClick={() => onCreate("campaigns")} className={ADMIN_SOFT_BUTTON}><Megaphone className="mr-1 h-4 w-4" /> Campana</Button>
          <Button onClick={() => onCreate("coupons")} variant="outline"><Percent className="mr-1 h-4 w-4" /> Cupon</Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MetricCard label="Campanas" value={String(data.records.marketingCampaigns.length)} />
        <MetricCard label="Cupones" value={String(data.records.couponRules.length)} />
        <MetricCard label="Banners" value={String(data.records.banners.length)} />
      </div>
      <Toolbar />
      <DataTable
        headers={["Tipo", "Nombre", "Regla/placement", "Estado"]}
        rows={rows}
        empty="No hay promociones, cupones o banners configurados"
      />
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
          <Button onClick={() => onCreate(module)} className={ADMIN_SOFT_BUTTON}>
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
            Este modulo lee tablas dedicadas de Supabase con permisos y flujo server-side.
          </p>
          <div className="mt-4 space-y-2">
            <ConfigRow label="Filas" value={String(rows.length)} />
            <ConfigRow label="Origen" value="Supabase" />
            <ConfigRow label="CRUD" value={canCreateModule(module) ? "Activo" : "Solo lectura"} />
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function PermissionsWindow({
  profiles,
  userRoles,
  auditLogs,
}: {
  profiles: DbRecord[];
  userRoles: DbRecord[];
  auditLogs: DbRecord[];
}) {
  return (
    <WindowFrame
      title="Usuarios y permisos"
      description="Roles administrativos, perfiles activos, auditoria y separacion admin/cliente."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Perfiles" value={String(profiles.length)} />
        <MetricCard label="Roles" value={String(userRoles.length)} />
        <MetricCard label="Admins" value={String(userRoles.filter((item) => ["admin", "super_admin"].includes(asText(item, "role"))).length)} />
        <MetricCard label="Auditoria" value={String(auditLogs.length)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <DataTable
          headers={["Usuario", "Email", "Rol perfil", "Estado"]}
          rows={profiles.map((profile) => [
            asText(profile, "full_name", asText(profile, "id")),
            asText(profile, "email"),
            asText(profile, "role"),
            asText(profile, "status", "active"),
          ])}
          empty="No hay perfiles"
        />
        <div className="space-y-4">
          <DataTable
            headers={["User ID", "Rol", "Asignado por", "Fecha"]}
            rows={userRoles.map((role) => [
              asText(role, "user_id"),
              asText(role, "role"),
              asText(role, "granted_by"),
              formatDate(role),
            ])}
            empty="No hay roles cargados"
          />
          <DataTable
            headers={["Accion", "Entidad", "Actor", "Fecha"]}
            rows={auditLogs.slice(0, 10).map((item) => [
              asText(item, "action"),
              `${asText(item, "entity_type")} ${asText(item, "entity_id")}`.trim(),
              asText(item, "actor_id"),
              formatDate(item),
            ])}
            empty="Sin auditoria reciente"
          />
        </div>
      </div>
    </WindowFrame>
  );
}

function SettingsWindow({ data }: { data: AdminData }) {
  const activePayments = data.records.paymentGateways.filter((item) => asText(item, "status") === "active").length;
  const activeShipping = data.records.shippingMethods.filter((item) => asText(item, "is_active") === "true").length;
  const sapGate = settingValue(data.records.systemSettings, "orders_ready_for_sap_enabled");

  return (
    <WindowFrame
      title="Ajustes de tienda"
      description="Datos operativos que condicionan checkout, pagos, envios, SAP, media y visibilidad ecommerce."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <DataTable
            headers={["Ajuste", "Valor", "Fuente", "Estado"]}
            rows={[
              ["Sucursales", String(data.stores.length), "stores", data.stores.length > 0 ? "Operativo" : "Pendiente"],
              ["Metodos de envio", `${activeShipping}/${data.records.shippingMethods.length}`, "shipping_methods", activeShipping > 0 ? "Operativo" : "Pendiente"],
              ["Pasarelas activas", `${activePayments}/${data.records.paymentGateways.length}`, "payment_gateways", activePayments > 0 ? "Operativo" : "Pendiente"],
              ["Banners activos", String(data.records.banners.length), "promotional_banners", data.records.banners.length > 0 ? "Operativo" : "Pendiente"],
              ["Productos admin", String(data.products.length), "products", data.products.length > 0 ? "Operativo" : "Pendiente middleware"],
            ]}
          />
          <DataTable
            headers={["Key", "Valor", "Actualizado"]}
            rows={data.records.systemSettings.map((item) => [
              asText(item, "key"),
              JSON.stringify(item.value ?? {}),
              formatDate(item, "updated_at"),
            ])}
            empty="No hay system_settings"
          />
        </div>
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2 font-black">
            <Settings2 className="h-5 w-5 text-primary" />
            Estado backend
          </div>
          <div className="mt-4 space-y-2">
            <ConfigRow label="Checkout" value="Edge Function + JWT + RPC checkout_create_order" />
            <ConfigRow label="Pagos" value="payment-events-handler + apply_payment_event" />
            <ConfigRow label="SAP inbound" value="sap-events-handler + x-webhook-secret" />
            <ConfigRow label="SAP outbound gate" value={sapGate?.enabled === true ? "Activo" : "Bloqueado"} />
            <ConfigRow label="Storage" value="product/category/banner/bulk buckets" />
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}

function SimpleManagementWindow({
  module,
  title,
  description,
  icon: Icon,
  data,
  onCreate,
}: {
  module: AdminModule;
  title: string;
  description: string;
  icon: typeof Activity;
  data: AdminData;
  onCreate: (module?: AdminModule) => void;
}) {
  const totalRevenue = data.records.orders.reduce((sum, order) => sum + asNumber(order, "total"), 0);
  const stockUnits = data.products.reduce((sum, product) => sum + product.stock, 0);
  const failedEvents = data.records.integrationQueue.filter((item) => ["failed", "retrying"].includes(asText(item, "status"))).length;
  const activePayments = data.records.paymentGateways.filter((item) => asText(item, "status") === "active").length;
  const activeShipping = data.records.shippingMethods.filter((item) => asText(item, "is_active") === "true").length;

  const table = (() => {
    if (module === "reports") {
      return {
        headers: ["Reporte", "Metrica", "Fuente", "Estado"],
        empty: "No hay registros suficientes para reportar",
        rows: [
          ["Ventas", formatPrice(totalRevenue), `${data.records.orders.length} pedidos`, data.records.orders.length > 0 ? "Con datos" : "Sin pedidos"],
          ["Inventario", `${stockUnits} uds`, `${data.products.length} productos`, data.products.length > 0 ? "Con datos" : "Sin catalogo"],
          ["Clientes", `${data.records.customerAccounts.length} cuentas`, "sap_business_partners", data.records.customerAccounts.length > 0 ? "Con datos" : "Sin clientes"],
          ["Facturacion", `${data.records.invoices.length} facturas`, "invoices", data.records.invoices.length > 0 ? "Con datos" : "Sin facturas"],
        ],
      };
    }

    if (module === "permissions") {
      return {
        headers: ["Usuario", "Telefono", "Creado", "Estado"],
        empty: "No hay perfiles administrativos o usuarios cargados",
        rows: data.records.profiles.map((profile) => [
          asText(profile, "full_name", asText(profile, "id")),
          asText(profile, "phone"),
          formatDate(profile),
          "Perfil activo",
        ]),
      };
    }

    if (module === "integrations") {
      return {
        headers: ["Integracion", "Registros", "Fuente", "Estado"],
        empty: "No hay eventos de integracion registrados",
        rows: [
          ["SAP Middleware", `${data.records.integrationQueue.length} eventos`, "integration_event_queue", failedEvents > 0 ? `${failedEvents} con retry/error` : "Sin errores"],
          ["FORZA", `${data.records.shipments.length} guias`, "shipments", data.records.shipments.length > 0 ? "Con datos" : "Sin guias"],
          ["Facturacion SAP", `${data.records.invoices.length} facturas`, "invoices", data.records.invoices.length > 0 ? "Con datos" : "Sin facturas"],
          ["Auditoria", `${data.records.auditLogs.length} eventos`, "audit_logs", data.records.auditLogs.length > 0 ? "Con trazabilidad" : "Sin eventos"],
        ],
      };
    }

    return {
      headers: ["Ajuste", "Valor", "Fuente", "Estado"],
      empty: "No hay configuracion operativa cargada",
      rows: [
        ["Sucursales", String(data.stores.length), "stores", data.stores.length > 0 ? "Operativo" : "Pendiente"],
        ["Metodos de envio", `${activeShipping}/${data.records.shippingMethods.length}`, "shipping_methods", activeShipping > 0 ? "Operativo" : "Pendiente"],
        ["Pasarelas activas", `${activePayments}/${data.records.paymentGateways.length}`, "payment_gateways", activePayments > 0 ? "Operativo" : "Pendiente"],
        ["Banners activos", String(data.records.banners.length), "promotional_banners", data.records.banners.length > 0 ? "Operativo" : "Pendiente"],
      ],
    };
  })();

  return (
    <WindowFrame
      title={title}
      description={description}
      actions={
        canCreateModule(module) ? (
          <Button onClick={() => onCreate(module)} className={ADMIN_SOFT_BUTTON}><Plus className="mr-1 h-4 w-4" /> Nuevo</Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div>
          <Toolbar />
          <DataTable headers={table.headers} rows={table.rows} empty={table.empty} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Icon className="h-8 w-8 text-primary" />
          <h3 className="mt-4 font-black">Fuente operacional</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta vista resume tablas vivas y estados actuales del sistema.
          </p>
          <div className="mt-4 space-y-2">
            <ConfigRow label="Registros" value={String(table.rows.length)} />
            <ConfigRow label="Origen" value="Supabase" />
            <ConfigRow label="Accion" value={canCreateModule(module) ? "CRUD activo" : "Solo lectura"} />
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

function CreateRecordModal({
  module,
  data,
  saving,
  onClose,
  onSave,
}: {
  module: AdminModule;
  data: AdminData;
  saving: boolean;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const meta = modules.find((item) => item.id === module);
  const fields = getCreateFields(module, data);

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
                  {field.options?.map((option) => {
                    const value = typeof option === "string" ? option : option.value;
                    const label = typeof option === "string" ? option : option.label;
                    return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                    );
                  })}
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
          <Button type="submit" disabled={saving} className={ADMIN_SOFT_BUTTON_STRONG}>
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

function selectOrText(
  name: string,
  label: string,
  options: Array<{ label: string; value: string }>,
  required = false,
  placeholder?: string,
): Field {
  return options.length > 0
    ? { name, label, type: "select", options, required }
    : { name, label, required, placeholder };
}

function getCreateFields(module: AdminModule, data?: AdminData): Field[] {
  const productOptions = data?.products.map((product) => ({
    value: product.id,
    label: `${product.sku} - ${product.name}`,
  })) ?? [];
  const storeOptions = data?.stores.map((store) => ({
    value: store.id,
    label: `${store.name} - ${store.city}`,
  })) ?? [];
  const shippingMethodOptions = data?.records.shippingMethods.map((method) => ({
    value: asText(method, "id"),
    label: `${asText(method, "name")} (${asText(method, "type")})`,
  })).filter((option) => option.value) ?? [];
  const orderOptions = data?.records.orders.map((order) => ({
    value: asText(order, "id"),
    label: `${asText(order, "order_number", asText(order, "id"))} - ${formatMaybePrice(order.total)}`,
  })).filter((option) => option.value) ?? [];
  const customerOptions = data?.records.customerAccounts.map((customer) => ({
    value: asText(customer, "id", asText(customer, "sap_card_code")),
    label: `${asText(customer, "card_name", asText(customer, "email"))} - ${asText(customer, "customer_type")}`,
  })).filter((option) => option.value) ?? [];
  const priceListOptions = data?.records.priceLists.map((list) => ({
    value: asText(list, "code", asText(list, "id")),
    label: `${asText(list, "code")} - ${asText(list, "name")}`,
  })).filter((option) => option.value) ?? [];

  switch (module) {
    case "products":
      return [
        { name: "sku", label: "SKU", required: true },
        { name: "slug", label: "Slug URL", required: true },
        { name: "name", label: "Nombre", required: true },
        { name: "sap_item_code", label: "Codigo SAP / ItemCode" },
        { name: "price", label: "Precio", type: "number", required: true },
        { name: "original_price", label: "Precio anterior", type: "number" },
        { name: "currency", label: "Moneda", placeholder: "GTQ" },
        { name: "ecommerce_status", label: "Estado ecommerce", type: "select", options: ["published", "draft", "needs_enrichment", "enriched", "archived"] },
        { name: "shipping_class", label: "Clase de envio", type: "select", options: ["standard", "fragile", "oversized", "pickup_only", "quote_required"] },
        { name: "safety_stock_default", label: "Stock de seguridad", type: "number" },
        { name: "image", label: "URL imagen", required: true },
        { name: "weight_kg", label: "Peso kg", type: "number" },
        { name: "width_cm", label: "Ancho cm", type: "number" },
        { name: "height_cm", label: "Alto cm", type: "number" },
        { name: "depth_cm", label: "Profundidad cm", type: "number" },
        { name: "description", label: "Descripcion", type: "textarea", required: true },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
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
        { name: "sap_card_code", label: "Codigo SAP", placeholder: "C000123" },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "full_name", label: "Nombre completo", required: true },
        { name: "phone", label: "Telefono" },
        selectOrText("price_list", "Lista de precios", priceListOptions, false, "Codigo de lista"),
        { name: "status", label: "Estado", type: "select", options: ["active", "pending", "blocked"] },
      ];
    case "b2b-users":
      return [
        { name: "sap_card_code", label: "Codigo SAP", placeholder: "B000123" },
        { name: "company_name", label: "Empresa", required: true },
        { name: "full_name", label: "Contacto", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "phone", label: "Telefono" },
        { name: "tax_id", label: "NIT" },
        { name: "credit_limit", label: "Limite de credito", type: "number" },
        selectOrText("price_list", "Lista de precios", priceListOptions, false, "Codigo de lista"),
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
        selectOrText("product_id", "Producto", productOptions, true, "ID de producto"),
        selectOrText("shipping_method_id", "Metodo de envio", shippingMethodOptions, true, "ID metodo de envio"),
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
        selectOrText("product_id", "Producto", productOptions, true, "ID de producto"),
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
        selectOrText("product_id", "Producto padre", productOptions, true, "ID de producto"),
        { name: "sku", label: "SKU variante", required: true },
        { name: "barcode", label: "Codigo de barras" },
        { name: "name", label: "Nombre", required: true },
        { name: "attributes", label: "Atributos JSON", placeholder: "{\"color\":\"blanco\"}", type: "textarea" },
        { name: "price_delta", label: "Diferencia de precio", type: "number" },
        { name: "status", label: "Estado", type: "select", options: ["active", "inactive"] },
      ];
    case "stock-realtime":
      return [
        selectOrText("product_id", "Producto", productOptions, true, "ID de producto"),
        selectOrText("store_id", "Tienda", storeOptions, true, "ID de tienda"),
        { name: "qty", label: "Cantidad", type: "number", required: true },
        { name: "status", label: "Estado", type: "select", options: ["reserved", "released", "committed", "expired"] },
        { name: "expires_at", label: "Expira en" },
      ];
    case "forza":
      return [
        selectOrText("order_id", "Pedido", orderOptions, true, "ID de pedido"),
        selectOrText("origin_store_id", "Sucursal origen", storeOptions, false, "ID de tienda"),
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
        selectOrText("order_id", "Pedido", orderOptions, true, "ID de pedido"),
        { name: "invoice_number", label: "Numero factura", required: true },
        { name: "invoice_status", label: "Estado", type: "select", options: ["pending", "issued", "voided", "failed"] },
        { name: "subtotal", label: "Subtotal", type: "number" },
        { name: "tax", label: "Impuesto", type: "number" },
        { name: "total", label: "Total", type: "number" },
      ];
    case "crm":
      return [
        selectOrText("customer_account_id", "Cliente", customerOptions, false, "ID de cliente"),
        { name: "activity_type", label: "Tipo", type: "select", options: ["note", "purchase", "support", "segment", "loyalty"] },
        { name: "title", label: "Titulo", required: true },
        { name: "description", label: "Descripcion", type: "textarea" },
        { name: "metadata", label: "Metadata JSON", type: "textarea" },
      ];
    case "support":
      return [
        selectOrText("customer_account_id", "Cliente", customerOptions, false, "ID de cliente"),
        selectOrText("order_id", "Pedido", orderOptions, false, "ID de pedido"),
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
        selectOrText("customer_account_id", "Cliente", customerOptions, false, "ID de cliente"),
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
        { name: "entity_id", label: "ID entidad" },
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
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = normalizedQuery
    ? rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(normalizedQuery)))
    : rows;

  if (rows.length === 0) return <EmptyAdminState label={empty ?? "No hay registros"} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Buscar en esta tabla..."
          />
        </div>
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          {filteredRows.length} de {rows.length}
        </span>
      </div>
      {filteredRows.length === 0 ? (
        <EmptyAdminState label="Sin resultados con ese filtro" />
      ) : (
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
              {filteredRows.map((row, index) => (
                <tr key={`${row[0]}-${index}`} className="hover:bg-surface/70">
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`} className="px-4 py-3 font-medium">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[180px] truncate text-right font-black">{value}</span>
    </div>
  );
}
