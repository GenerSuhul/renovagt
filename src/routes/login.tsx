import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, LockKeyhole, Mail, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Ingresar - RENOVA" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const { lines } = useCart();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const destination = lines.length > 0 ? "/checkout" : "/account";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesion iniciada");
        navigate({ to: destination });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName || email } },
      });
      if (error) throw error;
      if (data.session) {
        toast.success("Cuenta creada");
        navigate({ to: destination });
      } else {
        toast.success("Revisa tu correo", { description: "Confirma tu cuenta para iniciar sesion." });
      }
    } catch (error) {
      toast.error("No se pudo autenticar", { description: (error as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && user) {
    return (
      <AuthShell title="Ya tienes sesion activa" subtitle={user.email ?? ""}>
        <Link to={destination}>
          <Button className="w-full bg-primary font-bold hover:bg-primary-hover">Continuar</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={mode === "login" ? "Iniciar sesion" : "Crear cuenta"}
      subtitle="Compra mas rapido, consulta pedidos y guarda favoritos."
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <label className="block">
            <Label>Nombre completo</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1" />
          </label>
        )}
        <label className="block">
          <Label>Email</Label>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="pl-9" />
          </div>
        </label>
        <label className="block">
          <Label>Contrasena</Label>
          <div className="relative mt-1">
            <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" />
          </div>
        </label>
        <Button type="submit" disabled={submitting} className="h-11 w-full bg-primary font-bold hover:bg-primary-hover">
          {submitting ? "Procesando..." : mode === "login" ? <><Eye className="mr-2 h-4 w-4" /> Entrar</> : <><UserPlus className="mr-2 h-4 w-4" /> Crear cuenta</>}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-4 w-full text-sm font-bold text-primary"
      >
        {mode === "login" ? "Crear una cuenta nueva" : "Ya tengo cuenta"}
      </button>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto grid min-h-[68vh] place-items-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-primary">RENOVA</div>
          <h1 className="mt-2 text-2xl font-black">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
