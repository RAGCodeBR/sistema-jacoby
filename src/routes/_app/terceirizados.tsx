import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/terceirizados")({ component: OutsourcedCompaniesPage });

type OutsourcedCompany = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  service_description: string | null;
  environmental_license: string | null;
  address: string | null;
  postal_code: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  responsible: string | null;
  active: boolean;
};

const emptyForm = {
  legalName: "", tradeName: "", cnpj: "", serviceDescription: "", environmentalLicense: "",
  address: "", postalCode: "", phone: "", email: "", responsible: "",
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function OutsourcedCompaniesPage() {
  const { hasPermission, loading, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OutsourcedCompany | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["outsourced-companies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_companies" as any) as any).select("*").order("legal_name");
      if (error) throw error;
      return (data || []) as OutsourcedCompany[];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!form.legalName.trim()) throw Error("Informe a razão social da empresa.");
      const payload = {
        legal_name: form.legalName.trim(), trade_name: form.tradeName.trim() || null, cnpj: form.cnpj.trim() || null,
        service_description: form.serviceDescription.trim() || null, environmental_license: form.environmentalLicense.trim() || null,
        address: form.address.trim() || null, postal_code: form.postalCode.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
        responsible: form.responsible.trim() || null,
      };
      const { data: saved, error } = editing
        ? await (supabase.from("outsourced_companies" as any) as any).update(payload).eq("id", editing.id).select("id,logo_url").single()
        : await (supabase.from("outsourced_companies" as any) as any).insert({ ...payload, created_by: user?.id }).select("id,logo_url").single();
      if (error) throw error;
      if (logoFile && saved) {
        if (!logoFile.type.startsWith("image/")) throw Error("Escolha uma imagem PNG, JPG ou WebP.");
        if (logoFile.size > 5 * 1024 * 1024) throw Error("O logo deve ter no máximo 5 MB.");
        const safeName = logoFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${saved.id}/${Date.now()}-${safeName}`;
        const contentType = logoFile.type === "image/jpg" ? "image/jpeg" : logoFile.type;
        const { error: uploadError } = await supabase.storage.from("outsourced-company-logos").upload(path, logoFile, { contentType, upsert: false });
        if (uploadError) throw uploadError;
        const logoUrl = supabase.storage.from("outsourced-company-logos").getPublicUrl(path).data.publicUrl;
        const { error: logoError } = await (supabase.from("outsourced_companies" as any) as any)
          .update({ logo_url: logoUrl })
          .eq("id", saved.id);
        if (logoError) throw logoError;
      }
    },
    onSuccess: () => { toast.success(editing ? "Terceirizado atualizado." : "Terceirizado cadastrado."); setEditing(null); setForm(emptyForm); setLogoFile(null); void qc.invalidateQueries({ queryKey: ["outsourced-companies"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const edit = (company: OutsourcedCompany) => {
    setEditing(company);
    setLogoFile(null);
    setForm({ legalName: company.legal_name, tradeName: company.trade_name || "", cnpj: company.cnpj || "", serviceDescription: company.service_description || "", environmentalLicense: company.environmental_license || "", address: company.address || "", postalCode: company.postal_code || "", phone: company.phone || "", email: company.email || "", responsible: company.responsible || "" });
  };
  const remove = async (company: OutsourcedCompany) => {
    if (!confirm(`Excluir a empresa terceirizada “${company.trade_name || company.legal_name}”?`)) return;
    const { error } = await (supabase.from("outsourced_companies" as any) as any).delete().eq("id", company.id);
    if (error) toast.error(error.message); else { toast.success("Terceirizado excluído."); void qc.invalidateQueries({ queryKey: ["outsourced-companies"] }); }
  };
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!hasPermission("outsourced")) return <Navigate to="/dashboard" />;
  const visible = companies.filter((company) => `${company.legal_name} ${company.trade_name || ""} ${company.cnpj || ""}`.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <header><p className="text-sm font-medium text-primary">Cadastros</p><h1 className="text-2xl font-bold">Terceirizados</h1><p className="mt-1 text-sm text-muted-foreground">Empresas PJ responsáveis por tratamento, destinação ou transporte de resíduos.</p></header>
    <Card className="p-5"><h2 className="font-semibold">{editing ? "Editar empresa terceirizada" : "Novo terceirizado"}</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Razão social *"><Input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} /></Field><Field label="Nome fantasia"><Input value={form.tradeName} onChange={(event) => setForm({ ...form, tradeName: event.target.value })} /></Field><Field label="CNPJ"><Input value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: event.target.value })} /></Field><Field label="Responsável"><Input value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} /></Field><Field label="Telefone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field><Field label="E-mail"><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label="Licença ambiental / CETESB"><Input value={form.environmentalLicense} onChange={(event) => setForm({ ...form, environmentalLicense: event.target.value })} /></Field><Field label="Endereço"><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field><Field label="CEP"><Input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} placeholder="00000-000" /></Field><Field label="Serviço de tratamento"><Textarea className="min-h-10" value={form.serviceDescription} onChange={(event) => setForm({ ...form, serviceDescription: event.target.value })} /></Field><Field label="Logo da empresa"><input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} /><div className="flex items-center gap-2"><Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />{logoFile ? "Trocar logo" : editing?.logo_url ? "Substituir logo" : "Adicionar logo"}</Button>{logoFile && <span className="max-w-36 truncate text-xs text-muted-foreground">{logoFile.name}</span>}</div></Field></div><div className="mt-4 flex gap-2"><Button onClick={() => save.mutate()}><Plus className="mr-2 h-4 w-4" />{editing ? "Salvar alterações" : "Cadastrar empresa"}</Button>{editing && <Button variant="outline" onClick={() => { setEditing(null); setForm(emptyForm); setLogoFile(null); }}>Cancelar</Button>}</div></Card>
    <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por empresa ou CNPJ…" /></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{isLoading ? <p className="text-sm text-muted-foreground">Carregando empresas…</p> : visible.map((company) => <Card key={company.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3">{company.logo_url ? <img src={company.logo_url} alt="Logo da empresa" className="h-10 w-10 shrink-0 rounded-lg border bg-white object-contain p-1" /> : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>}<div><h2 className="font-semibold">{company.trade_name || company.legal_name}</h2><p className="text-xs text-muted-foreground">{company.legal_name}</p></div></div><div className="flex"><Button size="icon" variant="ghost" title="Editar" onClick={() => edit(company)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Excluir" onClick={() => void remove(company)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div><div className="mt-4 space-y-1 text-sm text-muted-foreground"><p>{company.cnpj ? `CNPJ: ${company.cnpj}` : "CNPJ não informado"}</p>{company.postal_code && <p>CEP: {company.postal_code}</p>}{company.service_description && <p className="text-foreground">{company.service_description}</p>}{company.environmental_license && <p>Licença: {company.environmental_license}</p>}{company.responsible && <p>Responsável: {company.responsible}</p>}</div></Card>)}{!isLoading && !visible.length && <Card className="p-6 text-sm text-muted-foreground">Nenhuma empresa terceirizada cadastrada.</Card>}</div>
  </div>;
}
