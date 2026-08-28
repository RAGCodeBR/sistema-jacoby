/** Painel inicial Jacoby: acompanhamento prático de validade dos documentos. */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useClients } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });
type Doc = { id: string; client_id: string; branch_id: string | null; title: string; file_name: string; expires_at: string | null; active: boolean };
type Branch = { id: string; name: string; cnpj: string | null };

function Stat({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof FileText; color: string }) {
  return <Card className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold tracking-tight">{value}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${color}20`, color }}><Icon className="h-5 w-5" /></span></div></Card>;
}
const day = 86_400_000;
function daysUntil(date: string) { return Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00`)) / day); }

function Dashboard() {
  const { isAdmin, profile, user } = useAuth(); const { data: clients = [] } = useClients();
  const { data: documents = [], isLoading } = useQuery({ queryKey: ["dashboard-client-documents"], enabled: isAdmin, queryFn: async () => { const { data, error } = await (supabase.from("client_documents") as any).select("id,client_id,branch_id,title,file_name,expires_at,active").eq("active", true); if (error) throw error; return (data ?? []) as Doc[]; } });
  const { data: branches = [] } = useQuery({ queryKey: ["dashboard-client-branches"], enabled: isAdmin, queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("id,name,cnpj"); if (error) throw error; return (data ?? []) as Branch[]; } });
  const summary = useMemo(() => { const dated = documents.filter((doc) => !!doc.expires_at); const overdue = dated.filter((doc) => daysUntil(doc.expires_at!) < 0); const valid = documents.filter((doc) => !doc.expires_at || daysUntil(doc.expires_at) >= 0); const dueSoon = dated.filter((doc) => { const days = daysUntil(doc.expires_at!); return days >= 0 && days <= 30; }); return { valid, overdue, dueSoon, dated: [...dated].sort((a, b) => daysUntil(a.expires_at!) - daysUntil(b.expires_at!)) }; }, [documents]);
  const clientName = (id: string) => clients.find((client) => client.id === id)?.name ?? "Cliente"; const unitName = (id: string | null) => id ? branches.find((branch) => branch.id === id)?.name ?? "Filial" : "Matriz";
  const greeting = profile?.full_name?.split(" ")[0] || user?.email?.split("@")[0];
  if (!isAdmin) return <div className="space-y-6 p-6"><header><h1 className="text-3xl font-bold tracking-tight">Olá, {greeting}</h1><p className="text-muted-foreground">Acompanhamento de documentos.</p></header><Card className="p-6 text-sm text-muted-foreground">O painel de validade documental é gerenciado pelos administradores. Consulte os documentos da sua empresa pelo Portal do Cliente.</Card></div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-6"><header><p className="text-sm font-medium text-primary">Jacoby Soluções Ambientais</p><h1 className="text-3xl font-bold tracking-tight">Controle de documentos</h1><p className="text-muted-foreground">Acompanhe vigências e vencimentos por cliente, matriz ou filial.</p></header><div className="grid gap-4 sm:grid-cols-3"><Stat label="Documentos vigentes" value={summary.valid.length} icon={CheckCircle2} color="#059669" /><Stat label="Documentos vencidos" value={summary.overdue.length} icon={AlertTriangle} color="#dc2626" /><Stat label="Vencem em até 30 dias" value={summary.dueSoon.length} icon={CalendarClock} color="#d97706" /></div><Card className="overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Documentos em acompanhamento</h2><p className="text-sm text-muted-foreground">Lista ordenada pelo vencimento mais próximo.</p></div>{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando documentos...</p> : !summary.dated.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum documento com vencimento informado.</p> : <div className="divide-y">{summary.dated.map((doc) => { const days = daysUntil(doc.expires_at!); const state = days < 0 ? `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}` : days === 0 ? "Vence hoje" : `Faltam ${days} dia${days === 1 ? "" : "s"}`; const color = days < 0 ? "text-destructive bg-destructive/10" : days <= 30 ? "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/30" : "text-primary bg-primary/10"; return <div key={doc.id} className="flex flex-wrap items-center gap-3 p-4"><FileText className="h-5 w-5 text-primary" /><div className="min-w-0 flex-1"><p className="font-medium">{doc.title}</p><p className="text-sm text-muted-foreground">{clientName(doc.client_id)} · {unitName(doc.branch_id)} · Vencimento: {new Intl.DateTimeFormat("pt-BR").format(new Date(`${doc.expires_at}T00:00:00`))}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>{state}</span></div>; })}</div>}</Card></div>;
}
