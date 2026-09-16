import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Eye, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/portal/documentos")({ component: ClientDocumentsPortal });
type Branch = { id: string; name: string; cnpj: string | null };
type Doc = { id: string; client_id: string; branch_id: string | null; title: string; description: string | null; file_name: string; storage_path: string; expires_at: string | null; notify_days_before: number; active: boolean };
const day = 86_400_000;
const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`)) / day);

function ClientDocumentsPortal() {
  const { data: clients = [] } = useClients();
  const { isClient, clientId: linkedClientId } = useAuth();
  const [clientId, setClientId] = useState("");
  const [branchId, setBranchId] = useState("matrix");
  const [preview, setPreview] = useState<{ doc: Doc; url: string } | null>(null);
  useEffect(() => { if (isClient) setClientId(linkedClientId ?? ""); else if (!clientId && clients[0]) setClientId(clients[0].id); }, [clientId, clients, isClient, linkedClientId]);
  useEffect(() => { setBranchId("matrix"); setPreview(null); }, [clientId]);
  const { data: branches = [] } = useQuery({ queryKey: ["client-branches", clientId], enabled: !!clientId, queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj").eq("client_id", clientId).eq("is_active", true).order("name"); if (error) throw error; return (data ?? []) as Branch[]; } });
  const { data: alertBranches = [] } = useQuery({ queryKey: ["document-alert-branches"], queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj").eq("is_active", true); if (error) throw error; return (data ?? []) as Branch[]; } });
  const { data: alertDocuments = [] } = useQuery({ queryKey: ["document-alerts"], queryFn: async () => { const { data, error } = await (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,description,file_name,storage_path,expires_at,notify_days_before,active").eq("active", true).not("expires_at", "is", null).order("expires_at", { ascending: true }); if (error) throw error; return (data ?? []) as Doc[]; } });
  const { data: documents = [] } = useQuery({ queryKey: ["portal-client-documents", clientId, branchId], enabled: !!clientId, queryFn: async () => { let request = (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,description,file_name,storage_path,expires_at,notify_days_before,active").eq("client_id", clientId).eq("active", true); request = branchId === "matrix" ? request.is("branch_id", null) : request.eq("branch_id", branchId); const { data, error } = await request.order("expires_at", { ascending: true, nullsFirst: false }); if (error) throw error; return (data ?? []) as Doc[]; } });
  const today = new Date().toISOString().slice(0, 10);
  const activeDocs = useMemo(() => documents.filter((doc) => !doc.expires_at || doc.expires_at >= today), [documents, today]);
  const alerts = useMemo(() => alertDocuments.filter((doc) => { const days = daysUntil(doc.expires_at!); return days < 0 || days <= Number(doc.notify_days_before || 0); }), [alertDocuments]);
  const previewDocument = async (doc: Doc) => { const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 600); if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível visualizar o documento."); setPreview({ doc, url: data.signedUrl }); };
  const download = async (doc: Doc) => { const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(doc.storage_path, 600, { download: doc.file_name }); if (error || !data?.signedUrl) return toast.error(error?.message || "Não foi possível baixar o documento."); window.open(data.signedUrl, "_blank", "noopener,noreferrer"); };
  const client = clients.find((item) => item.id === clientId);
  const selectedBranch = branches.find((item) => item.id === branchId);
  const clientName = (id: string) => clients.find((item) => item.id === id)?.name ?? "Cliente";
  const unitName = (id: string | null) => id ? alertBranches.find((item) => item.id === id)?.name ?? "Filial" : "Matriz";

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Documentos</h1><p className="text-sm text-muted-foreground">Veja primeiro os documentos que exigem atenção e, depois, consulte uma empresa ou unidade.</p></header>
    {alerts.length > 0 && <Card className="border-destructive/40 bg-destructive/5 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div className="min-w-0 flex-1"><h2 className="font-semibold text-destructive">Documentos em alerta ({alerts.length})</h2><p className="mt-1 text-sm text-muted-foreground">Vencidos ou dentro do prazo de aviso configurado.</p><div className="mt-3 space-y-2">{alerts.slice(0, 8).map((doc) => { const days = daysUntil(doc.expires_at!); const state = days < 0 ? `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}` : days === 0 ? "Vence hoje" : `Vence em ${days} dia${days === 1 ? "" : "s"}`; return <div key={doc.id} className="flex flex-wrap items-center gap-3 rounded-md bg-background/80 p-3"><FileText className="h-5 w-5 text-destructive" /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="text-sm text-muted-foreground">{clientName(doc.client_id)} · {unitName(doc.branch_id)} · {state}</p></div><Button size="sm" variant="outline" onClick={() => void previewDocument(doc)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button></div>; })}{alerts.length > 8 && <p className="text-sm text-muted-foreground">E mais {alerts.length - 8} documento(s) em alerta.</p>}</div></div></div></Card>}
    <Card className="grid gap-4 p-4 sm:grid-cols-2">{!isClient && <div className="space-y-1.5"><Label>Cliente</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-1.5"><Label>Unidade / CNPJ</Label><Select value={branchId} onValueChange={setBranchId} disabled={!clientId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="matrix">Matriz{client?.cnpj ? ` · ${client.cnpj}` : ""}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}{branch.cnpj ? ` · ${branch.cnpj}` : ""}</SelectItem>)}</SelectContent></Select></div></Card>
    <section className="space-y-3"><h2 className="text-lg font-semibold">{branchId === "matrix" ? client?.name ?? "Matriz" : selectedBranch?.name ?? "Filial"}</h2>{activeDocs.map((doc) => <Card key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className="text-primary" /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="text-sm text-muted-foreground">{doc.description || doc.file_name}{doc.expires_at ? ` · Vigente até ${doc.expires_at}` : ""}</p></div><Button variant="outline" onClick={() => void previewDocument(doc)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button variant="outline" onClick={() => void download(doc)}><Download className="mr-2 h-4 w-4" />Baixar</Button></Card>)}{clientId && !activeDocs.length && <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum documento vigente cadastrado para esta unidade.</Card>}</section>
    {preview && <Card className="overflow-hidden"><div className="flex items-center justify-between border-b p-3"><div className="min-w-0"><p className="truncate font-medium">{preview.doc.title}</p><p className="truncate text-sm text-muted-foreground">{preview.doc.file_name}</p></div><Button variant="ghost" size="icon" onClick={() => setPreview(null)} title="Fechar visualização"><X className="h-4 w-4" /></Button></div><iframe title={`Visualização de ${preview.doc.title}`} src={preview.url} className="h-[72vh] w-full bg-white" /><div className="border-t p-3"><Button variant="outline" onClick={() => void download(preview.doc)}><Download className="mr-2 h-4 w-4" />Baixar documento</Button></div></Card>}
  </div>;
}
