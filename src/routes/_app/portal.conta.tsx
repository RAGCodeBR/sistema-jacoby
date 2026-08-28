/** Dados de acesso que o próprio cliente pode administrar no portal. */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/portal/conta")({ component: PortalAccountPage });

function PortalAccountPage() {
  const { isClient, profile, user } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isClient) return <Navigate to="/portal/documentos" replace />;

  const savePassword = async () => {
    if (password.length < 6) return toast.error("A nova senha deve ter pelo menos 6 caracteres.");
    if (password !== confirmation) return toast.error("A confirmação da senha não confere.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirmation("");
    toast.success("Sua senha foi atualizada com sucesso.");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Portal do Cliente</p>
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <p className="text-sm text-muted-foreground">Gerencie a senha usada para acessar o portal.</p>
      </header>
      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div><p className="font-medium">Acesso do portal</p><p className="text-sm text-muted-foreground">{profile?.full_name || "Cliente"} · {user?.email}</p></div>
        </div>
        <div className="space-y-2"><Label htmlFor="portal-new-password">Nova senha</Label><Input id="portal-new-password" type="password" minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></div>
        <div className="space-y-2"><Label htmlFor="portal-confirm-password">Confirmar nova senha</Label><Input id="portal-confirm-password" type="password" minLength={6} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Digite a senha novamente" /></div>
        <Button onClick={() => void savePassword()} disabled={saving || !password || !confirmation}><KeyRound className="mr-2 h-4 w-4" />{saving ? "Atualizando..." : "Atualizar senha"}</Button>
      </Card>
    </div>
  );
}
