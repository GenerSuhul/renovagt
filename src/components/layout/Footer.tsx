import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Twitter, Youtube, MapPin, Phone, Mail, ShieldCheck, Truck, CreditCard, RotateCcw } from "lucide-react";
import { categories } from "@/lib/mock-data";

export function Footer() {
  return (
    <footer className="bg-secondary text-secondary-foreground mt-16">
      {/* Service strip */}
      <div className="border-b border-white/10">
        <div className="container mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: Truck, t: "Envío rápido", s: "A todo el país" },
            { icon: RotateCcw, t: "Devoluciones", s: "30 días sin preguntas" },
            { icon: ShieldCheck, t: "Compra segura", s: "Pago 100% protegido" },
            { icon: CreditCard, t: "Cuotas sin interés", s: "Con tarjetas seleccionadas" },
          ].map((it) => (
            <div key={it.t} className="flex items-center gap-3">
              <it.icon className="h-7 w-7 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-sm">{it.t}</div>
                <div className="text-xs opacity-75">{it.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-black text-lg">R</div>
            <span className="font-black text-xl">RENOVA</span>
          </div>
          <p className="text-sm opacity-75 leading-relaxed">
            Tu aliado en hogar, construcción y herramientas. Calidad profesional para todos los proyectos.
          </p>
          <div className="flex gap-2 mt-4">
            {[Facebook, Instagram, Twitter, Youtube].map((Icon, i) => (
              <a key={i} href="#" className="h-9 w-9 rounded-full bg-white/10 hover:bg-primary flex items-center justify-center transition-colors">
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-bold text-sm uppercase tracking-wide mb-4">Categorías</h4>
          <ul className="space-y-2 text-sm opacity-90">
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to="/c/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm uppercase tracking-wide mb-4">Atención al cliente</h4>
          <ul className="space-y-2 text-sm opacity-90">
            <li><Link to="/account">Mi cuenta</Link></li>
            <li><Link to="/account/orders">Estado de pedidos</Link></li>
            <li><Link to="/stores">Localizador de tiendas</Link></li>
            <li><a href="#">Política de devoluciones</a></li>
            <li><a href="#">Términos y condiciones</a></li>
            <li><a href="#">Privacidad</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm uppercase tracking-wide mb-4">Contacto</h4>
          <ul className="space-y-3 text-sm opacity-90">
            <li className="flex gap-2"><Phone className="h-4 w-4 mt-0.5 shrink-0" /> +502 2222 1010</li>
            <li className="flex gap-2"><Mail className="h-4 w-4 mt-0.5 shrink-0" /> hola@renova.com.gt</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5 shrink-0" /> 12 Calle 4-50, Zona 10, Guatemala</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 py-5 text-xs opacity-70 flex flex-col md:flex-row gap-2 justify-between">
          <span>© {new Date().getFullYear()} RENOVA. Todos los derechos reservados.</span>
          <span>Sistema integrado con SAP Business One HANA</span>
        </div>
      </div>
    </footer>
  );
}
