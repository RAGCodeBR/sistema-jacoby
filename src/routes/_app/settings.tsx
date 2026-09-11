import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: Settings,
});

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Settings() {
  const { profile, user, refreshProfile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar_url ?? null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const companyLogoInputRef = useRef<HTMLInputElement>(null);
  const [companyForm, setCompanyForm] = useState({
    legalName: "JACOBY SOLUÇÕES AMBIENTAIS",
    tradeName: "Jacoby Soluções Ambientais",
    cnpj: "52.014.169/0001-02",
    address: "Rua Projetada Sessenta, 331 - Jardim Irmã Dolores - São Vicente/SP",
    postalCode: "11347-505",
    phone: "(13) 99128-5772",
    email: "",
    environmentalLicense: "CETESB nº 6575734034 - Dispensa de licença",
    logoUrl: "",
  });

  useEffect(() => {
    setName(profile?.full_name ?? "");
    if (!avatarFile) setAvatarPreview(profile?.avatar_url ?? null);
  }, [profile, avatarFile]);

  useEffect(() => {
    if (!avatarFile) return;
    const preview = URL.createObjectURL(avatarFile);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatarFile]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data, error } = await (supabase.from("company_profiles" as any) as any)
        .select("*")
        .eq("is_primary", true)
        .maybeSingle();
      if (error || !data) return;
      setCompanyId(data.id);
      setCompanyForm({
        legalName: data.legal_name || "", tradeName: data.trade_name || "", cnpj: data.cnpj || "",
        address: data.address || "", postalCode: data.postal_code || "", phone: data.phone || "",
        email: data.email || "", environmentalLicense: data.environmental_license || "", logoUrl: data.logo_url || "",
      });
    })();
  }, [isAdmin]);

  const selectAvatar = (file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      toast.error("Use uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("A foto deve ter no máximo 5 MB.");
      return;
    }
    setRemoveAvatar(false);
    setAvatarFile(file);
  };

  const save = async () => {
    if (!user) return;
    const fullName = name.trim();
    if (!fullName) {
      toast.error("Informe seu nome completo.");
      return;
    }

    setSaving(true);
    try {
      let avatarUrl = removeAvatar ? null : profile?.avatar_url ?? null;
      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${user.id}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("profile-avatars")
          .upload(path, avatarFile, { contentType: avatarFile.type, upsert: false });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("profile-avatars").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName, avatar_url: avatarUrl })
        .eq("id", user.id);
      if (error) throw error;

      setAvatarFile(null);
      setRemoveAvatar(false);
      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Perfil atualizado");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveCompany = async () => {
    if (!companyForm.legalName.trim()) return toast.error("Informe a razão social da Jacoby.");
    setCompanySaving(true);
    try {
      const payload = {
        legal_name: companyForm.legalName.trim(), trade_name: companyForm.tradeName.trim() || null,
        cnpj: companyForm.cnpj.trim() || null, address: companyForm.address.trim() || null,
        postal_code: companyForm.postalCode.trim() || null, phone: companyForm.phone.trim() || null,
        email: companyForm.email.trim() || null, environmental_license: companyForm.environmentalLicense.trim() || null,
      };
      const { data: saved, error } = companyId
        ? await (supabase.from("company_profiles" as any) as any).update(payload).eq("id", companyId).select("id").single()
        : await (supabase.from("company_profiles" as any) as any).insert({ ...payload, is_primary: true }).select("id").single();
      if (error) throw error;
      let logoUrl = companyForm.logoUrl;
      if (companyLogoFile) {
        if (!ACCEPTED_AVATAR_TYPES.includes(companyLogoFile.type) || companyLogoFile.size > MAX_AVATAR_SIZE) {
          throw Error("Use um logo PNG, JPG ou WebP de até 5 MB.");
        }
        const extension = companyLogoFile.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${saved.id}/logo-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("company-profile-logos").upload(path, companyLogoFile, { contentType: companyLogoFile.type === "image/jpg" ? "image/jpeg" : companyLogoFile.type, upsert: false });
        if (uploadError) throw uploadError;
        logoUrl = supabase.storage.from("company-profile-logos").getPublicUrl(path).data.publicUrl;
        const { error: logoError } = await (supabase.from("company_profiles" as any) as any).update({ logo_url: logoUrl }).eq("id", saved.id);
        if (logoError) throw logoError;
      }
      setCompanyId(saved.id);
      setCompanyLogoFile(null);
      setCompanyForm({ ...companyForm, logoUrl });
      toast.success("Dados institucionais da Jacoby salvos.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCompanySaving(false);
    }
  };

  const initials = (name || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Personalização</h1>
        <p className="text-sm text-muted-foreground">Edite seu perfil e escolha a foto usada no Kanban.</p>
      </header>

      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 border">
            <AvatarImage src={removeAvatar ? undefined : avatarPreview || undefined} alt="Sua foto de perfil" />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <Label htmlFor="profile-avatar" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <ImageUp className="h-4 w-4" /> Escolher foto
            </Label>
            <Input
              id="profile-avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => selectAvatar(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 5 MB.</p>
            {(avatarPreview || profile?.avatar_url) && !removeAvatar && (
              <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-destructive hover:text-destructive" onClick={() => { setAvatarFile(null); setRemoveAvatar(true); setAvatarPreview(null); }}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover foto
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-name">Nome completo</Label>
          <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>E-mail</Label>
          <Input value={user?.email ?? ""} disabled />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar perfil"}
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">Como a foto é usada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua foto aparece nos cards do Kanban quando você for responsável ou colaborador de uma tarefa.
        </p>
      </Card>

      {isAdmin && <Card className="space-y-5 p-6">
        <div><h2 className="font-semibold">Dados institucionais da Jacoby</h2><p className="mt-1 text-sm text-muted-foreground">Estes dados aparecem no Boletim de Medição e no demonstrativo em PDF como empresa gerenciadora.</p></div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2"><Label>Razão social *</Label><Input value={companyForm.legalName} onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })} /></div>
          <div className="space-y-2"><Label>Nome fantasia</Label><Input value={companyForm.tradeName} onChange={(event) => setCompanyForm({ ...companyForm, tradeName: event.target.value })} /></div>
          <div className="space-y-2"><Label>CNPJ</Label><Input value={companyForm.cnpj} onChange={(event) => setCompanyForm({ ...companyForm, cnpj: event.target.value })} /></div>
          <div className="space-y-2"><Label>CEP</Label><Input value={companyForm.postalCode} onChange={(event) => setCompanyForm({ ...companyForm, postalCode: event.target.value })} /></div>
          <div className="space-y-2"><Label>Telefone</Label><Input value={companyForm.phone} onChange={(event) => setCompanyForm({ ...companyForm, phone: event.target.value })} /></div>
          <div className="space-y-2"><Label>E-mail</Label><Input value={companyForm.email} onChange={(event) => setCompanyForm({ ...companyForm, email: event.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Endereço</Label><Input value={companyForm.address} onChange={(event) => setCompanyForm({ ...companyForm, address: event.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Licença ambiental / CETESB</Label><Input value={companyForm.environmentalLicense} onChange={(event) => setCompanyForm({ ...companyForm, environmentalLicense: event.target.value })} /></div>
          <div className="space-y-2"><Label>Logo da Jacoby</Label><input ref={companyLogoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setCompanyLogoFile(event.target.files?.[0] || null)} /><div className="flex items-center gap-3"><Button type="button" variant="outline" onClick={() => companyLogoInputRef.current?.click()}><ImageUp className="mr-2 h-4 w-4" />{companyLogoFile ? "Trocar logo" : companyForm.logoUrl ? "Substituir logo" : "Adicionar logo"}</Button>{companyLogoFile && <span className="max-w-48 truncate text-xs text-muted-foreground">{companyLogoFile.name}</span>}{!companyLogoFile && companyForm.logoUrl && <img src={companyForm.logoUrl} className="h-9 w-16 rounded border bg-white object-contain p-1" alt="Logo Jacoby" />}</div></div>
        </div>
        <Button onClick={() => void saveCompany()} disabled={companySaving}>{companySaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</> : "Salvar dados da Jacoby"}</Button>
      </Card>}
    </div>
  );
}
