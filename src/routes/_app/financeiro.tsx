import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HandCoins, Pencil } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useClients } from "@/hooks/use-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_app/financeiro")({ component: FinancialControlPage });

type FinancialService = {
  id: string; cycle_id: string; waste_service_id: string; outsourced_company_id: string | null; amount: number;
  execution_date: string | null; request_date: string | null; equipment_description: string | null; quantity: number | null;
  description: string | null; service_order: string | null; closing_date: string | null; invoice_issued_on: string | null;
  invoice_number: string | null; invoice_due_date: string | null; net_invoice_amount: number | null;
  commission_rate: number; commission_due_date: string | null; certificate_number: string | null;
  certificate_expires_on: string | null; payment_status: "pending" | "received"; received_on: string | null; financial_notes: string | null;
};
type Cycle = { id: string; client_id: string; branch_id: string | null; bulletin_number: number };
type Named = { id: string; name?: string; legal_name?: string; trade_name?: string | null };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const emptyForm = { amount: "0", request_date: "", equipment_description: "", quantity: "", description: "", service_order: "", closing_date: "", invoice_issued_on: "", invoice_number: "", invoice_due_date: "", net_invoice_amount: "", commission_rate: "0", commission_due_date: "", certificate_number: "", certificate_expires_on: "", payment_status: "pending", received_on: "", financial_notes: "" };

function FinancialControlPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useClients();
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<FinancialService | null>(null);
  const [form, setForm] = useState(emptyForm);
  const servicesQuery = useQuery({ queryKey: ["outsourced-financial-services"], queryFn: async () => {
    const { data, error } = await (supabase.from("billing_v2_cycle_services" as any) as any).select("*").not("outsourced_company_id", "is", null).not("execution_date", "is", null).order("execution_date", { ascending: false });
    if (error) throw error;
    return (data || []) as FinancialService[];
  }});
  const cyclesQuery = useQuery({ queryKey: ["outsourced-financial-cycles"], queryFn: async () => {
    const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any).select("id,client_id,branch_id,bulletin_number");
    if (error) throw error;
    return (data || []) as Cycle[];
  }});
  const companiesQuery = useQuery({ queryKey: ["outsourced-financial-companies"], queryFn: async () => {
    const { data, error } = await (supabase.from("outsourced_companies" as any) as any).select("id,legal_name,trade_name").order("legal_name");
    if (error) throw error;
    return (data || []) as Named[];
  }});
  const servicesCatalogQuery = useQuery({ queryKey: ["outsourced-financial-service-catalog"], queryFn: async () => {
    const { data, error } = await (supabase.from("waste_services" as any) as any).select("id,name");
    if (error) throw error;
    return (data || []) as Named[];
  }});
  const branchesQuery = useQuery({ queryKey: ["outsourced-financial-branches"], queryFn: async () => {
    const { data, error } = await (supabase.from("client_branches" as any) as any).select("id,name");
    if (error) throw error;
    return (data || []) as Named[];
  }});
  const cycles = cyclesQuery.data || [], companies = companiesQuery.data || [], catalog = servicesCatalogQuery.data || [], branches = branchesQuery.data || [];
  const rows = useMemo(() => (servicesQuery.data || []).map((item) => {
    const cycle = cycles.find((value) => value.id === item.cycle_id);
    const client = clients.find((value) => value.id === cycle?.client_id);
    const company = companies.find((value) => value.id === item.outsourced_company_id);
    const service = catalog.find((value) => value.id === item.waste_service_id);
    const branch = branches.find((value) => value.id === cycle?.branch_id);
    return { item, cycle, clientName: client?.name || "Cliente", companyName: company?.trade_name || company?.legal_name || "Terceirizada", serviceName: service?.name || "Serviço", branchName: branch?.name || "Matriz" };
  }).filter((row) => (companyFilter === "all" || row.item.outsourced_company_id === companyFilter) && (statusFilter === "all" || row.item.payment_status === statusFilter)), [servicesQuery.data, cycles, clients, companies, catalog, branches, companyFilter, statusFilter]);
  const totalOpen = rows.filter((row) => row.item.payment_status === "pending").reduce((total, row) => total + Number(row.item.net_invoice_amount ?? row.item.amount ?? 0), 0);
  const totalReceived = rows.filter((row) => row.item.payment_status === "received").reduce((total, row) => total + Number(row.item.net_invoice_amount ?? row.item.amount ?? 0), 0);
  const commissionTotal = rows.reduce((total, row) => total + Number(row.item.net_invoice_amount ?? row.item.amount ?? 0) * Number(row.item.commission_rate || 0) / 100, 0);
  const openEdit = (item: FinancialService) => {
    setEditing(item);
    setForm({ amount: String(item.amount ?? 0), request_date: item.request_date || "", equipment_description: item.equipment_description || "", quantity: item.quantity == null ? "" : String(item.quantity), description: item.description || "", service_order: item.service_order || "", closing_date: item.closing_date || "", invoice_issued_on: item.invoice_issued_on || "", invoice_number: item.invoice_number || "", invoice_due_date: item.invoice_due_date || "", net_invoice_amount: item.net_invoice_amount == null ? "" : String(item.net_invoice_amount), commission_rate: String(item.commission_rate || 0), commission_due_date: item.commission_due_date || "", certificate_number: item.certificate_number || "", certificate_expires_on: item.certificate_expires_on || "", payment_status: item.payment_status || "pending", received_on: item.received_on || "", financial_notes: item.financial_notes || "" });
  };
  const save = useMutation({ mutationFn: async () => {
    if (!editing) return;
    const numberOrNull = (value: string) => value === "" ? null : Number(value.replace(",", "."));
    const payload = { amount: numberOrNull(form.amount) ?? 0, request_date: form.request_date || null, equipment_description: form.equipment_description.trim() || null, quantity: numberOrNull(form.quantity), description: form.description.trim() || null, service_order: form.service_order.trim() || null, closing_date: form.closing_date || null, invoice_issued_on: form.invoice_issued_on || null, invoice_number: form.invoice_number.trim() || null, invoice_due_date: form.invoice_due_date || null, net_invoice_amount: numberOrNull(form.net_invoice_amount), commission_rate: numberOrNull(form.commission_rate) ?? 0, commission_due_date: form.commission_due_date || null, certificate_number: form.certificate_number.trim() || null, certificate_expires_on: form.certificate_expires_on || null, payment_status: form.payment_status, received_on: form.received_on || null, financial_notes: form.financial_notes.trim() || null };
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any).update(payload).eq("id", editing.id);
    if (error) throw error;
  }, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["outsourced-financial-services"] }); setEditing(null); toast.success("Controle financeiro atualizado."); }, onError: (error: Error) => toast.error(error.message) });
  if (!hasPermission("billing")) return <Navigate to="/dashboard" />;
  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6"><header><p className="text-sm font-medium text-primary">Faturamento</p><h1 className="text-2xl font-bold">Financeiro de terceirizados</h1><p className="mt-1 text-sm text-muted-foreground">Serviços emitidos por terceirizada entram aqui automaticamente quando a data de execução é informada no BM.</p></header>
    <Card className="grid gap-3 p-4 md:grid-cols-2"><div><Label>Empresa terceirizada</Label><Select value={companyFilter} onValueChange={setCompanyFilter}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as terceirizadas</SelectItem>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>)}</SelectContent></Select></div><div><Label>Situação de recebimento</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem><SelectItem value="pending">Aguardando recebimento</SelectItem><SelectItem value="received">Recebido</SelectItem></SelectContent></Select></div></Card>
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="A receber das terceirizadas" value={totalOpen} /><Metric label="Recebido" value={totalReceived} /><Metric label="Comissão prevista" value={commissionTotal} /></div>
    <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Controle financeiro</h2><p className="mt-1 text-sm text-muted-foreground">Os valores e datas abaixo são editáveis. O valor da comissão é calculado pelo percentual informado.</p></div>{servicesQuery.isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando serviços...</p> : !rows.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum serviço terceirizado com data de execução informada.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1250px] text-sm"><thead><tr className="border-b bg-muted/30 text-left text-muted-foreground"><th className="p-3">Cliente</th><th className="p-3">Terceirizada</th><th className="p-3">Serviço</th><th className="p-3">Execução</th><th className="p-3">OS</th><th className="p-3">BM</th><th className="p-3">Valor</th><th className="p-3">NF líquida</th><th className="p-3">Comissão</th><th className="p-3">Recebimento</th><th className="p-3" /></tr></thead><tbody>{rows.map(({ item, cycle, clientName, companyName, serviceName }) => { const base = Number(item.net_invoice_amount ?? item.amount ?? 0); const commission = base * Number(item.commission_rate || 0) / 100; return <tr key={item.id} className="border-b"><td className="p-3 font-medium">{clientName}</td><td className="p-3">{companyName}</td><td className="p-3">{serviceName}</td><td className="p-3">{formatDate(item.execution_date)}</td><td className="p-3">{item.service_order || "—"}</td><td className="p-3">#{String(cycle?.bulletin_number || 0).padStart(3, "0")}</td><td className="p-3">{money.format(Number(item.amount || 0))}</td><td className="p-3">{money.format(base)}</td><td className="p-3">{money.format(commission)} <span className="text-muted-foreground">({Number(item.commission_rate || 0)}%)</span></td><td className="p-3"><span className={item.payment_status === "received" ? "font-medium text-primary" : "text-amber-700"}>{item.payment_status === "received" ? "Recebido" : "Aguardando"}</span></td><td className="p-3"><Button size="icon" variant="ghost" title="Editar controle" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div>}</Card>
    <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Editar controle financeiro</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><Field label="Valor do serviço"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Data da solicitação"><Input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} /></Field><Field label="Equipamento"><Input value={form.equipment_description} onChange={(e) => setForm({ ...form, equipment_description: e.target.value })} /></Field><Field label="Quantidade"><Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field><Field label="Ordem de serviço"><Input value={form.service_order} onChange={(e) => setForm({ ...form, service_order: e.target.value })} /></Field><Field label="Data de fechamento"><Input type="date" value={form.closing_date} onChange={(e) => setForm({ ...form, closing_date: e.target.value })} /></Field><Field label="Emissão da nota"><Input type="date" value={form.invoice_issued_on} onChange={(e) => setForm({ ...form, invoice_issued_on: e.target.value })} /></Field><Field label="Número da nota"><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></Field><Field label="Vencimento da nota"><Input type="date" value={form.invoice_due_date} onChange={(e) => setForm({ ...form, invoice_due_date: e.target.value })} /></Field><Field label="Valor líquido da nota"><Input type="number" step="0.01" value={form.net_invoice_amount} onChange={(e) => setForm({ ...form, net_invoice_amount: e.target.value })} /></Field><Field label="Percentual de comissão"><Input type="number" min="0" step="0.01" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></Field><Field label="Vencimento da comissão"><Input type="date" value={form.commission_due_date} onChange={(e) => setForm({ ...form, commission_due_date: e.target.value })} /></Field><Field label="Número do certificado"><Input value={form.certificate_number} onChange={(e) => setForm({ ...form, certificate_number: e.target.value })} /></Field><Field label="Validade do certificado"><Input type="date" value={form.certificate_expires_on} onChange={(e) => setForm({ ...form, certificate_expires_on: e.target.value })} /></Field><Field label="Recebimento"><Select value={form.payment_status} onValueChange={(payment_status) => setForm({ ...form, payment_status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Aguardando recebimento</SelectItem><SelectItem value="received">Recebido</SelectItem></SelectContent></Select></Field><Field label="Data de recebimento"><Input type="date" value={form.received_on} onChange={(e) => setForm({ ...form, received_on: e.target.value })} /></Field><div className="sm:col-span-2"><Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="Observações financeiras"><Textarea value={form.financial_notes} onChange={(e) => setForm({ ...form, financial_notes: e.target.value })} /></Field></div></div><DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => save.mutate()} disabled={save.isPending}><CheckCircle2 />{save.isPending ? "Salvando..." : "Salvar controle"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 flex items-center gap-2 text-xl font-bold"><HandCoins className="h-5 w-5 text-primary" />{money.format(value)}</p></Card>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`)) : "—"; }
