import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  Truck,
  Twitter,
  Youtube,
} from "lucide-react";
import { getCategories } from "@/lib/catalog";

export function Footer() {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories });

  return (
    <footer className="mt-16 bg-secondary text-secondary-foreground">
      <div className="border-b border-white/10">
        <div className="container mx-auto grid grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4">
          {[
            { icon: Truck, title: "Envio rapido", subtitle: "A todo el pais" },
            { icon: RotateCcw, title: "Devoluciones", subtitle: "Gestion por pedido" },
            { icon: ShieldCheck, title: "Compra segura", subtitle: "Pago protegido" },
            { icon: CreditCard, title: "Cuotas", subtitle: "Segun pasarela activa" },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3">
              <item.icon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-xs opacity-75">{item.subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container mx-auto grid grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-lg font-black text-primary-foreground">R</div>
            <span className="text-xl font-black">RENOVA</span>
          </div>
          <p className="text-sm leading-relaxed opacity-75">
            Tu aliado en hogar, construccion y herramientas. Calidad profesional para todos los proyectos.
          </p>
          <div className="mt-4 flex gap-2">
            {[Facebook, Instagram, Twitter, Youtube].map((Icon, index) => (
              <a
                key={index}
                href="https://renovagt.com"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-primary"
                aria-label="Red social RENOVA"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wide">Categorias</h4>
          <ul className="space-y-2 text-sm opacity-90">
            {categories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <Link to="/c/$slug" params={{ slug: category.slug }} className="hover:text-primary">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wide">Atencion al cliente</h4>
          <ul className="space-y-2 text-sm opacity-90">
            <li><Link to="/account">Mi cuenta</Link></li>
            <li><Link to="/account/orders">Estado de pedidos</Link></li>
            <li><Link to="/stores">Localizador de tiendas</Link></li>
            <li><Link to="/returns">Politica de devoluciones</Link></li>
            <li><Link to="/terms">Terminos y condiciones</Link></li>
            <li><Link to="/privacy">Privacidad</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="mb-4 text-sm font-bold uppercase tracking-wide">Contacto</h4>
          <ul className="space-y-3 text-sm opacity-90">
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" /> +502 2222 1010</li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" /> hola@renova.com.gt</li>
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> Guatemala, Guatemala</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container mx-auto flex flex-col justify-between gap-2 px-4 py-5 text-xs opacity-70 md:flex-row">
          <span>© {new Date().getFullYear()} RENOVA. Todos los derechos reservados.</span>
          <span>Compra segura, retiro en tienda y envios a Guatemala</span>
        </div>
      </div>
    </footer>
  );
}
