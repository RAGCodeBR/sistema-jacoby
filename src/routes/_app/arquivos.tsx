import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Cloud, Download, Eye, File, FileUp, FolderOpen, Loader2, Pencil, Plus, ShieldCheck, Trash2, Unplug, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FILES_OWNER_ID } from "@/lib/files-access";

export const Route = createFileRoute("/_app/arquivos")({ component: FilesPage });

type OneDriveItem = { id: string; name: string; webUrl: string | null; size?: number | null; folder: { childCount?: number } | null; file: { mimeType?: string } | null };
type Connection = { account_name: string | null; account_email: string | null; connected_at: string } | null;
type Preview = { itemId: string; name: string; mimeType: string; url: string } | null;

function FilesPage() {
  const { isAdmin, loading, user, session } = useAuth();
  const [connection, setConnection] = useState<Connection>(null);
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderCache = useRef(new Map<string, OneDriveItem[]>());
  const activeFolderId = folders.at(-1)?.id ?? null;
  const activeCacheKey = activeFolderId || "__root__";

  const request = useCallback(async (method: "GET" | "POST", body?: Record<string, unknown>) => {
    const folderId = method === "GET" ? body?.folderId : undefined;
    const response = await fetch(folderId ? `/api/onedrive?folderId=${encodeURIComponent(String(folderId))}` : "/api/onedrive", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || "Não foi possível acessar o OneDrive.");
    return json;
  }, [session?.access_token]);

  const refresh = useCallback(async (force = false) => {
    if (!session?.access_token) return;
    const cached = folderCache.current.get(activeCacheKey);
    if (cached && !force) {
      setItems(cached);
      setFolderLoading(false);
      return;
    }
    setFolderLoading(true);
    try {
      const data = await request("GET", { folderId: activeFolderId });
      setConnection(data.connection ?? null);
      const nextItems = data.items ?? [];
      folderCache.current.set(activeCacheKey, nextItems);
      setItems(nextItems);
    } catch (error) { toast.error((error as Error).message); } finally { setFolderLoading(false); }
  }, [request, session?.access_token, activeFolderId, activeCacheKey]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin || user?.id !== FILES_OWNER_ID) return <Navigate to="/dashboard" replace />;

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    try { await job(); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); }
  };
  const connect = () => run(async () => { const data = await request("POST", { action: "connect" }); window.location.assign(data.url); });
  const newFolder = () => {
    const name = window.prompt("Nome da nova pasta:");
    if (!name?.trim()) return;
    void run(async () => { await request("POST", { action: "folder", name, parentId: activeFolderId }); folderCache.current.delete(activeCacheKey); await refresh(true); toast.success("Pasta criada no OneDrive."); });
  };
  const rename = (item: OneDriveItem) => {
    const name = window.prompt("Novo nome:", item.name);
    if (!name?.trim() || name === item.name) return;
    void run(async () => { await request("POST", { action: "rename", itemId: item.id, name }); folderCache.current.delete(activeCacheKey); await refresh(true); toast.success("Nome atualizado no OneDrive."); });
  };
  const remove = (item: OneDriveItem) => {
    if (!window.confirm(`Mover “${item.name}” para a lixeira do OneDrive?`)) return;
    void run(async () => { await request("POST", { action: "delete", itemId: item.id }); folderCache.current.delete(activeCacheKey); await refresh(true); toast.success("Item movido para a lixeira do OneDrive."); });
  };
  const disconnect = () => {
    if (!window.confirm("Desconectar o OneDrive do sistema? Os arquivos não serão excluídos.")) return;
    void run(async () => { await request("POST", { action: "disconnect" }); await refresh(); });
  };
  const openFolder = (item: OneDriveItem) => {
    const cached = folderCache.current.get(item.id);
    setItems(cached ?? []);
    setFolderLoading(!cached);
    setFolders((current) => [...current, { id: item.id, name: item.name }]);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Nesta tela, envie arquivos de até 4 MB.");
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); });
    await run(async () => { await request("POST", { action: "upload", name: file.name, base64, mimeType: file.type, parentId: activeFolderId }); folderCache.current.delete(activeCacheKey); await refresh(true); toast.success("Arquivo enviado ao OneDrive."); });
  };
  const isPreviewable = (item: OneDriveItem) => {
    const name = item.name.toLowerCase();
    const mime = item.file?.mimeType || "";
    return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/") || mime.includes("json") || /\.(pdf|png|jpe?g|gif|webp|svg|txt|csv|json|md)$/i.test(name);
  };
  const previewItem = (item: OneDriveItem) => {
    const mimeType = item.file?.mimeType || "application/octet-stream";
    if (!isPreviewable(item)) {
      toast.message("Este formato não possui prévia. Use o botão de download.");
      return;
    }
    if ((item.size ?? 0) > 20 * 1024 * 1024) {
      toast.error("Para não travar o sistema, a prévia está limitada a arquivos de até 20 MB. Use o download para este arquivo.");
      toast.message("Este arquivo é grande para prévia. Use o botão de download.");
      return;
    }
    void run(async () => {
      const response = await fetch(`/api/onedrive/content/${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível abrir o arquivo."); }
      const mimeType = response.headers.get("content-type") || item.file?.mimeType || "application/octet-stream";
      const url = URL.createObjectURL(await response.blob());
      setPreview({ itemId: item.id, name: item.name, mimeType, url });
    });
  };
  const downloadPreview = async () => {
    if (!preview) return;
    if (!preview.url) {
      const item = items.find((candidate) => candidate.id === preview.itemId);
      if (!item) return;
      const response = await fetch(`/api/onedrive/content/${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível baixar o arquivo."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = preview.name;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = preview.name;
    link.click();
  };
  const downloadItem = async (item: OneDriveItem) => {
    const response = await fetch(`/api/onedrive/content/${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível baixar o arquivo."); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = item.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header><p className="text-sm font-medium text-primary">Central de documentos</p><h1 className="text-2xl font-bold tracking-tight">Arquivos</h1><p className="mt-1 text-sm text-muted-foreground">Acesse a estrutura real do OneDrive da empresa sem criar cópias no sistema.</p></header>
    <Card className="overflow-hidden border-primary/20">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-primary/5 p-5"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Cloud className="h-6 w-6" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">OneDrive</h2><Badge variant={connection ? "default" : "secondary"}>{connection ? "Conectado" : "Não conectado"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{connection ? `Conta vinculada: ${connection.account_email || connection.account_name || "Microsoft"}` : "Conecte a conta Microsoft da Jacoby para começar."}</p></div></div>{connection ? <div className="flex gap-2"><Button variant="outline" onClick={newFolder} disabled={busy}><Plus /> Nova pasta</Button><Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}><Upload /> Enviar arquivo</Button><input ref={fileInput} type="file" className="hidden" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} /><Button variant="ghost" onClick={disconnect} disabled={busy}><Unplug /> Desconectar</Button></div> : <Button onClick={connect} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Cloud />} Conectar OneDrive</Button>}</div>
      <div className="grid gap-4 p-5 md:grid-cols-3"><Info icon={FolderOpen} title="Pastas e arquivos reais" description="Tudo que aparece aqui vem diretamente do OneDrive." /><Info icon={FileUp} title="Alterações sincronizadas" description="Pastas, nomes e exclusões feitos aqui refletem na conta Microsoft." /><Info icon={ShieldCheck} title="Exclusão segura" description="Itens excluídos são enviados primeiro para a lixeira do OneDrive." /></div>
    </Card>
    {connection && <Card className="overflow-hidden"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Meus arquivos</h2><p className="text-sm text-muted-foreground">{folders.length ? `Raiz / ${folders.map((folder) => folder.name).join(" / ")}` : "Raiz do OneDrive"}</p></div><div className="flex gap-2">{folders.length > 0 && <Button size="sm" variant="outline" onClick={() => setFolders((current) => current.slice(0, -1))} disabled={busy || folderLoading}><ArrowLeft /> Voltar</Button>}<Button size="sm" variant="outline" onClick={() => void refresh(true)} disabled={busy || folderLoading}>{folderLoading ? <Loader2 className="animate-spin" /> : "Atualizar"}</Button></div></div>{folderLoading ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo pasta…</div> : items.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum arquivo ou pasta neste local.</div> : <div className="divide-y">{items.map((item) => <div key={item.id} className="flex items-center gap-3 p-4 hover:bg-muted/30"><span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">{item.folder ? <FolderOpen className="h-5 w-5" /> : <File className="h-5 w-5" />}</span><button className="min-w-0 flex-1 text-left" onClick={() => item.folder ? openFolder(item) : previewItem(item)}><p className="truncate font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.folder ? `${item.folder.childCount ?? 0} itens` : item.file?.mimeType || "Arquivo"}</p></button><div className="flex gap-1">{!item.folder && <><Button variant="ghost" size="icon" title="Visualizar" onClick={() => previewItem(item)} disabled={busy}><Eye /></Button><Button variant="ghost" size="icon" title="Baixar" onClick={() => void run(() => downloadItem(item))} disabled={busy}><Download /></Button></>}<Button variant="ghost" size="icon" title="Renomear" onClick={() => rename(item)} disabled={busy}><Pencil /></Button><Button variant="ghost" size="icon" title="Excluir" onClick={() => remove(item)} disabled={busy} className="text-destructive hover:text-destructive"><Trash2 /></Button></div></div>)}</div>}</Card>}
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="grid h-[85vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)] gap-3 p-4"><DialogHeader><DialogTitle className="pr-8">{preview?.name}</DialogTitle><DialogDescription>Prévia segura pelo sistema Jacoby.</DialogDescription></DialogHeader>{preview && (preview.mimeType.startsWith("image/") ? <div className="grid h-full min-h-0 place-items-center overflow-auto rounded-md bg-muted"><img src={preview.url} alt={preview.name} className="max-h-full max-w-full object-contain" /></div> : <iframe title={preview.name} src={preview.url} className="h-full min-h-0 w-full rounded-md border" />)}</DialogContent></Dialog>
  </div>;
}

function Info({ icon: Icon, title, description }: { icon: typeof FolderOpen; title: string; description: string }) { return <div className="rounded-xl border bg-card p-4"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-3 font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
