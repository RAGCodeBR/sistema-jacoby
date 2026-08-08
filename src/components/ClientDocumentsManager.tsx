import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ClientDocument = { id: string; title: string; description: string | null; file_name: string; storage_path: string; expires_at: string | null; notify_days_before: number; active: boolean; created_at: string };
const empty = { title: "", description: "", expiresAt: "", notifyDays: "30" };
const safeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "documento";

export function ClientDocumentsManager({ clientId }: { clientId: string }) {
  const qc = useQueryClient(); const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<ClientDocument | null>(null); const [file, setFile] = useState<File | null>(null); const [form, setForm] = useState(empty);
  const { data: documents = [] } = useQuery({ queryKey: ["client-documents", clientId], queryFn: async () => { const { data, error } = await (supabase.from("client_documents") as any).select("*").eq("client_id", clientId).order("expires_at", { ascending: true, nullsFirst: false }); if (error) throw error; return (data ?? []) as ClientDocument[]; } });
  const close = () => { setOpen(false); setEditing(null); setFile(null); setForm(empty); };
  const create = () => { close(); setOpen(true); };
  const edit = (doc: ClientDocument) => { setEditing(doc); setFile(null); setForm({ title: doc.title, description: doc.description ?? "", expiresAt: doc.expires_at ?? "", notifyDays: String(doc.notify_days_before) }); setOpen(true); };
  const save = async () => {
    if (!form.title.trim()) return toast.error("Informe o nome do documento.");
    if (!editing && !file) return toast.error("Anexe o arquivo do documento.");
    const notifyDays = Math.max(0, Number.parseInt(form.notifyDays, 10) || 0);
    let storagePath = editing?.storage_path; let fileName = editing?.file_name;
    if (file) { storagePath = `${clientId}/${Date.now()}-${safeName(file.name)}`; const { error } = await supabase.storage.from("client-documents").upload(storagePath, file, { contentType: file.type || "application/octet-stream" }); if (error) return toast.error(error.message); fileName = file.name; }
    const data = { client_id: clientId, title: form.title.trim(), description: form.description.trim() || null, storage_path: storagePath, file_name: fileName, expires_at: form.expiresAt || null, notify_days_before: notifyDays, active: true };
    const result = editing ? await (supabase.from("client_documents") as any).update(data).eq("id", editing.id) : await (supabase.from("client_documents") as any).insert(data);
    if (result.error) return toast.error(result.error.message);
    await (supabase.rpc("jacoby_process_document_alerts") as any);
    if (file && editing?.storage_path && editing.storage_path !== storagePath) await supabase.storage.from("client-documents").remove([editing.storage_path]);
    await qc.invalidateQueries({ queryKey: ["client-documents", clientId] }); close(); toast.success(editing ? "Documento atualizado." : "Documento anexado.");
  };
  const remove = async (doc: ClientDocument) => { if (!confirm(`Excluir o documento “${doc.title}”?`)) return; const { error } = await (supabase.from("client_documents") as any).delete().eq("id", doc.id); if (error) return toast.error(error.message); await supabase.storage.from("client-documents").remove([doc.storage_path]); await qc.invalidateQueries({ queryKey: ["client-documents", clientId] }); toast.success("Documento excluído."); };
  const today = new Date().toISOString().slice(0, 10);
  return <section className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Controle de documentos</h2><p className="text-sm text-muted-foreground">Anexe documentos, defina vencimentos e escolha quantos dias antes os administradores serão avisados.</p></div><Button onClick={create}><Plus className="mr-2 h-4 w-4" />Adicionar documento</Button></div>{open && <Card className="space-y-4 p-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Nome do documento</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Licença ambiental" /></div><div className="space-y-2"><Label>Vencimento</Label><Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div></div><div className="grid gap-4 sm:grid-cols-[1fr_180px]"><div className="space-y-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Observações opcionais" /></div><div className="space-y-2"><Label>Notificar antes</Label><Input type="number" min="0" value={form.notifyDays} onChange={(e) => setForm({ ...form, notifyDays: e.target.value })} /><p className="text-xs text-muted-foreground">dias antes do vencimento</p></div></div><div className="space-y-2"><Label>Arquivo</Label><input ref={inputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" />{file ? "Trocar arquivo" : editing ? "Substituir arquivo" : "Anexar arquivo"}</Button><span className="ml-3 text-sm text-muted-foreground">{file?.name ?? editing?.file_name ?? "Todos os formatos são aceitos"}</span></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancelar</Button><Button onClick={save}>Salvar documento</Button></div></Card>}<div className="space-y-2">{documents.map((doc) => { const expired = !!doc.expires_at && doc.expires_at < today; return <Card key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className={expired ? "text-destructive" : "text-primary"} /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="truncate text-sm text-muted-foreground">{doc.file_name}{doc.expires_at ? ` · Vence em ${doc.expires_at}` : " · Sem vencimento"}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>{expired ? "Vencido" : "Vigente"}</span><Button size="icon" variant="ghost" onClick={() => edit(doc)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => remove(doc)}><Trash2 className="h-4 w-4 text-destructive" /></Button></Card>; })}{!documents.length && <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum documento cadastrado para este cliente.</Card>}</div></section>;
}
