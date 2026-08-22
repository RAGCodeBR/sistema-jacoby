/**
 * Relatório de Gestão de Resíduos
 *
 * This component deliberately replaces the workbook's multiple dependent tabs
 * with one report object. The report owns movements, rates, MTR declarations
 * and weighing tickets, so every total is recalculated from the same source.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Download, FileCheck2, FilePlus2, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Report = { id: string; client_id: string; period_start: string; period_end: string; responsible: string | null; status: "draft" | "published"; notes: string | null };
type Movement = { id: string; report_id: string; waste_category: CategoryKey; occurred_on: string; service_order: string | null; placed_quantity: number; placed_container_type: string | null; removed_quantity: number; removed_container_type: string | null; weight_kg: number; mtr_number: string | null; destination_name: string | null; observation: string | null };
type Rate = { id: string; report_id: string; waste_category: CategoryKey; rental_rate: number; exchange_rate: number; treatment_rate: number };
type Ticket = { id: string; report_id: string; waste_category: CategoryKey; ticket_number: string | null; weighed_on: string | null; vehicle_plate: string | null; gross_weight_kg: number | null; tare_weight_kg: number | null; net_weight_kg: number | null; observation: string | null };
type Declaration = { id: string; report_id: string; waste_class: "class_i" | "class_ii"; mtr_numbers: string | null; transporter_name: string | null; destination_name: string | null; issued_on: string | null };

const categories = [
  ["class_ii_a", "Classe II A — Lixo comercial / triagem", "II"],
  ["entulho", "Classe II B — Entulho", "II"],
  ["madeira", "Classe II B — Madeira", "II"],
  ["reciclaveis", "Classe II B — Recicláveis", "II"],
  ["class_i_mix", "Classe I — Mix de sólidos contaminados", "I"],
  ["borra_oleosa", "Classe I — Líquidos / borra oleosa", "I"],
] as const;
type CategoryKey = typeof categories[number][0];
const categoryName = (key: CategoryKey) => categories.find(([id]) => id === key)?.[1] ?? key;
const brNumber = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0);
const brMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const currentMonth = () => new Date().toISOString().slice(0, 7);

export function WasteManagementModule({ portal = false }: { portal?: boolean }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { isAdmin, isClient, clientId: linkedClientId } = useAuth();
  const [clientId, setClientId] = useState("");
  const [reportId, setReportId] = useState("");
  const [period, setPeriod] = useState(currentMonth());
  const [movementCategory, setMovementCategory] = useState<CategoryKey>("class_ii_a");
  const [movement, setMovement] = useState({ occurred_on: new Date().toISOString().slice(0, 10), service_order: "", placed_quantity: "0", placed_container_type: "", removed_quantity: "0", removed_container_type: "", weight_kg: "0", mtr_number: "", destination_name: "", observation: "" });
  const [ticket, setTicket] = useState({ waste_category: "class_ii_a" as CategoryKey, ticket_number: "", weighed_on: new Date().toISOString().slice(0, 10), vehicle_plate: "", gross_weight_kg: "", tare_weight_kg: "", net_weight_kg: "", observation: "" });

  useEffect(() => {
    if (isClient) setClientId(linkedClientId ?? "");
    else if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [isClient, linkedClientId, clientId, clients]);

  const { data: reports = [] } = useQuery({ queryKey: ["waste-reports", clientId], enabled: !!clientId, queryFn: async () => {
    const { data, error } = await (supabase.from("waste_reports" as any) as any).select("id,client_id,period_start,period_end,responsible,status,notes").eq("client_id", clientId).order("period_start", { ascending: false });
    if (error) throw error; return (data ?? []) as Report[];
  } });
  useEffect(() => { if (!reportId && reports[0]) setReportId(reports[0].id); }, [reports, reportId]);
  const report = reports.find((item) => item.id === reportId) ?? null;
  const reportQuery = { enabled: !!reportId, queryFn: async <T,>(table: string) => { const { data, error } = await (supabase.from(table as any) as any).select("*").eq("report_id", reportId); if (error) throw error; return (data ?? []) as T[]; } };
  const { data: movements = [] } = useQuery({ queryKey: ["waste-movements", reportId], ...reportQuery, queryFn: () => reportQuery.queryFn<Movement>("waste_movements") });
  const { data: rates = [] } = useQuery({ queryKey: ["waste-rates", reportId], ...reportQuery, queryFn: () => reportQuery.queryFn<Rate>("waste_billing_rates") });
  const { data: tickets = [] } = useQuery({ queryKey: ["waste-tickets", reportId], ...reportQuery, queryFn: () => reportQuery.queryFn<Ticket>("waste_weighing_tickets") });
  const { data: declarations = [] } = useQuery({ queryKey: ["waste-declarations", reportId], ...reportQuery, queryFn: () => reportQuery.queryFn<Declaration>("waste_declarations") });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["waste-"] });

  const createReport = useMutation({ mutationFn: async () => {
    if (!clientId) throw new Error("Selecione o cliente.");
    const [year, month] = period.split("-").map(Number);
    const start = `${period}-01`;
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    const { data, error } = await (supabase.from("waste_reports" as any) as any).insert({ client_id: clientId, period_start: start, period_end: end, status: "draft" }).select("id").single();
    if (error) throw error;
    await (supabase.from("waste_billing_rates" as any) as any).insert(categories.map(([waste_category]) => ({ report_id: data.id, waste_category })));
    return data.id as string;
  }, onSuccess: (id) => { toast.success("Relatório criado."); setReportId(id); void qc.invalidateQueries({ queryKey: ["waste-reports", clientId] }); }, onError: (e: Error) => toast.error(e.message) });
  const addMovement = useMutation({ mutationFn: async () => {
    if (!reportId) throw new Error("Crie ou selecione um relatório.");
    const { error } = await (supabase.from("waste_movements" as any) as any).insert({ report_id: reportId, waste_category: movementCategory, ...movement, placed_quantity: Number(movement.placed_quantity || 0), removed_quantity: Number(movement.removed_quantity || 0), weight_kg: Number(movement.weight_kg || 0) });
    if (error) throw error;
  }, onSuccess: () => { toast.success("Movimentação registrada."); setMovement((value) => ({ ...value, service_order: "", placed_quantity: "0", removed_quantity: "0", weight_kg: "0", mtr_number: "", observation: "" })); void qc.invalidateQueries({ queryKey: ["waste-movements", reportId] }); }, onError: (e: Error) => toast.error(e.message) });
  const addTicket = useMutation({ mutationFn: async () => {
    if (!reportId) throw new Error("Crie ou selecione um relatório.");
    const { error } = await (supabase.from("waste_weighing_tickets" as any) as any).insert({ ...ticket, report_id: reportId, gross_weight_kg: ticket.gross_weight_kg ? Number(ticket.gross_weight_kg) : null, tare_weight_kg: ticket.tare_weight_kg ? Number(ticket.tare_weight_kg) : null, net_weight_kg: ticket.net_weight_kg ? Number(ticket.net_weight_kg) : null });
    if (error) throw error;
  }, onSuccess: () => { toast.success("Ticket registrado."); void qc.invalidateQueries({ queryKey: ["waste-tickets", reportId] }); }, onError: (e: Error) => toast.error(e.message) });
  const removeMovement = useMutation({ mutationFn: async (id: string) => { const { error } = await (supabase.from("waste_movements" as any) as any).delete().eq("id", id); if (error) throw error; }, onSuccess: () => void qc.invalidateQueries({ queryKey: ["waste-movements", reportId] }), onError: (e: Error) => toast.error(e.message) });
  const publish = useMutation({ mutationFn: async () => { if (!reportId) return; const { error } = await (supabase.from("waste_reports" as any) as any).update({ status: report?.status === "published" ? "draft" : "published" }).eq("id", reportId); if (error) throw error; }, onSuccess: () => { toast.success("Visibilidade do relatório atualizada."); void qc.invalidateQueries({ queryKey: ["waste-reports", clientId] }); }, onError: (e: Error) => toast.error(e.message) });
  const saveRate = async (category: CategoryKey, field: "rental_rate" | "exchange_rate" | "treatment_rate", value: string) => {
    if (!reportId) return;
    const existing = rates.find((rate) => rate.waste_category === category);
    const { error } = await (supabase.from("waste_billing_rates" as any) as any).upsert({ id: existing?.id, report_id: reportId, waste_category: category, rental_rate: existing?.rental_rate ?? 0, exchange_rate: existing?.exchange_rate ?? 0, treatment_rate: existing?.treatment_rate ?? 0, [field]: Number(value || 0) }, { onConflict: "report_id,waste_category" });
    if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["waste-rates", reportId] });
  };

  const totals = useMemo(() => Object.fromEntries(categories.map(([key]) => {
    const rows = movements.filter((item) => item.waste_category === key);
    const onClient = rows.reduce((sum, item) => sum + Number(item.placed_quantity || 0) - Number(item.removed_quantity || 0), 0);
    const exchanges = rows.reduce((sum, item) => sum + Number(item.removed_quantity || 0), 0);
    const weight = rows.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
    const rate = rates.find((item) => item.waste_category === key);
    const billing = onClient * Number(rate?.rental_rate || 0) + exchanges * Number(rate?.exchange_rate || 0) + weight * Number(rate?.treatment_rate || 0);
    return [key, { onClient, exchanges, weight, billing, rate }];
  })), [movements, rates]);
  const totalWeight = Object.values(totals).reduce((sum, item) => sum + item.weight, 0);
  const totalBilling = Object.values(totals).reduce((sum, item) => sum + item.billing, 0);
  const client = clients.find((item) => item.id === clientId);
  const exportPdf = async () => {
    if (!report) return toast.error("Selecione um relatório.");
    const { jsPDF } = await import("jspdf"); const pdf = new jsPDF("p", "mm", "a4");
    pdf.setFontSize(18); pdf.text("Relatório de Gestão de Resíduos", 16, 18);
    pdf.setFontSize(10); pdf.text(`Cliente: ${client?.name ?? ""}`, 16, 26); pdf.text(`Período: ${report.period_start} a ${report.period_end}`, 16, 32);
    let y = 43; pdf.setFontSize(11); pdf.text("Resumo de movimentação", 16, y); y += 7; pdf.setFontSize(9);
    categories.forEach(([key, label]) => { const total = totals[key]; pdf.text(`${label}: ${brNumber(total.weight)} kg | ${brNumber(total.exchanges)} trocas | ${brMoney(total.billing)}`, 16, y); y += 6; });
    y += 4; pdf.setFontSize(11); pdf.text(`Total movimentado: ${brNumber(totalWeight)} kg`, 16, y); y += 6; pdf.text(`Faturamento total: ${brMoney(totalBilling)}`, 16, y);
    y += 12; pdf.text("MTRs e destinações", 16, y); y += 6; pdf.setFontSize(9);
    movements.filter((item) => item.mtr_number || item.destination_name).forEach((item) => { if (y > 275) { pdf.addPage(); y = 18; } pdf.text(`${item.occurred_on} — ${categoryName(item.waste_category)} — MTR: ${item.mtr_number || "não informado"} — ${item.destination_name || "destino não informado"}`, 16, y, { maxWidth: 175 }); y += 8; });
    pdf.save(`relatorio-gestao-residuos-${report.period_start}.pdf`);
  };

  const heading = portal ? "Relatório de Gestão de Resíduos" : "Gestão de Resíduos";
  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">{portal ? "Portal do Cliente" : "Controle ambiental integrado"}</p><h1 className="text-2xl font-bold">{heading}</h1><p className="max-w-3xl text-sm text-muted-foreground">Movimentações, pesagens, MTRs, declarações, faturamento e PDF em um único relatório.</p></div>{report && <Button onClick={() => void exportPdf()}><Download className="mr-2 h-4 w-4" />Gerar PDF</Button>}</header>
    <Card className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto_auto]"><div><Label>Cliente</Label>{isClient ? <p className="mt-2 font-medium">{client?.name ?? "Cliente não vinculado"}</p> : <Select value={clientId} onValueChange={(value) => { setClientId(value); setReportId(""); }}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}</div><div><Label>Relatório / período</Label><Select value={reportId} onValueChange={setReportId}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar relatório" /></SelectTrigger><SelectContent>{reports.map((item) => <SelectItem key={item.id} value={item.id}>{item.period_start} a {item.period_end} · {item.status === "published" ? "Publicado" : "Rascunho"}</SelectItem>)}</SelectContent></Select></div>{isAdmin && <><div><Label>Novo período</Label><Input className="mt-1" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div><Button className="self-end" onClick={() => createReport.mutate()} disabled={!clientId || createReport.isPending}><FilePlus2 className="mr-2 h-4 w-4" />Novo relatório</Button></>}{isAdmin && report && <Button className="md:col-span-4" variant={report.status === "published" ? "outline" : "default"} onClick={() => publish.mutate()}>{report.status === "published" ? "Voltar para rascunho" : "Publicar para o cliente"}</Button>}</Card>
    {!report ? <Card className="p-12 text-center text-sm text-muted-foreground">{isAdmin ? "Selecione ou crie um relatório mensal para começar." : "Nenhum relatório publicado disponível para esta empresa."}</Card> : <Tabs defaultValue="painel" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto"><TabsTrigger value="painel">Painel</TabsTrigger><TabsTrigger value="movimentacoes">Movimentações</TabsTrigger><TabsTrigger value="faturamento">Faturamento</TabsTrigger><TabsTrigger value="declaracoes">Declarações e MTR</TabsTrigger><TabsTrigger value="pesagens">Tickets de pesagem</TabsTrigger><TabsTrigger value="relatorios">Relatórios</TabsTrigger></TabsList>
      <TabsContent value="painel" className="space-y-4"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Total movimentado" value={`${brNumber(totalWeight)} kg`} icon={<Scale className="h-4 w-4" />} /><Metric title="Faturamento calculado" value={brMoney(totalBilling)} icon={<BarChart3 className="h-4 w-4" />} /><Metric title="Movimentações" value={String(movements.length)} icon={<FileCheck2 className="h-4 w-4" />} /><Metric title="Tickets" value={String(tickets.length)} icon={<Scale className="h-4 w-4" />} /></section><Card className="p-4"><h2 className="font-semibold">Movimentação por tipo de resíduo</h2><div className="mt-5 space-y-4">{categories.map(([key, label]) => { const percent = totalWeight ? Math.round(totals[key].weight / totalWeight * 100) : 0; return <div key={key}><div className="mb-1 flex flex-wrap justify-between gap-2 text-sm"><span>{label}</span><strong>{brNumber(totals[key].weight)} kg · {percent}%</strong></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} /></div></div>; })}</div></Card></TabsContent>
      <TabsContent value="movimentacoes" className="space-y-4">{isAdmin && <Card className="p-4"><h2 className="font-semibold">Nova movimentação</h2><div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4"><Field label="Resíduo"><Select value={movementCategory} onValueChange={(value) => setMovementCategory(value as CategoryKey)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Data"><Input type="date" value={movement.occurred_on} onChange={(e) => setMovement({ ...movement, occurred_on: e.target.value })} /></Field><Field label="Ordem de serviço"><Input value={movement.service_order} onChange={(e) => setMovement({ ...movement, service_order: e.target.value })} /></Field><Field label="Peso (kg)"><Input type="number" min="0" value={movement.weight_kg} onChange={(e) => setMovement({ ...movement, weight_kg: e.target.value })} /></Field><Field label="Caçambas colocadas"><Input type="number" min="0" value={movement.placed_quantity} onChange={(e) => setMovement({ ...movement, placed_quantity: e.target.value })} /></Field><Field label="Tipo colocado"><Input value={movement.placed_container_type} onChange={(e) => setMovement({ ...movement, placed_container_type: e.target.value })} /></Field><Field label="Caçambas removidas"><Input type="number" min="0" value={movement.removed_quantity} onChange={(e) => setMovement({ ...movement, removed_quantity: e.target.value })} /></Field><Field label="Tipo removido"><Input value={movement.removed_container_type} onChange={(e) => setMovement({ ...movement, removed_container_type: e.target.value })} /></Field><Field label="MTR"><Input value={movement.mtr_number} onChange={(e) => setMovement({ ...movement, mtr_number: e.target.value })} /></Field><Field label="Destinação"><Input value={movement.destination_name} onChange={(e) => setMovement({ ...movement, destination_name: e.target.value })} /></Field><Field label="Observação"><Input value={movement.observation} onChange={(e) => setMovement({ ...movement, observation: e.target.value })} /></Field><Button className="self-end" onClick={() => addMovement.mutate()} disabled={addMovement.isPending}>Registrar</Button></div></Card>}<MovementTable movements={movements} onDelete={isAdmin ? (id) => removeMovement.mutate(id) : undefined} /></TabsContent>
      <TabsContent value="faturamento"><Card className="overflow-x-auto p-4"><h2 className="font-semibold">Demonstrativo de faturamento</h2><p className="mt-1 text-sm text-muted-foreground">As quantidades vêm das movimentações. As tarifas substituem as abas de faturamento da planilha.</p><table className="mt-4 min-w-[820px] w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Resíduo</th><th className="p-2">No cliente</th><th className="p-2">Trocas</th><th className="p-2">Peso (kg)</th><th className="p-2">Locação</th><th className="p-2">Troca</th><th className="p-2">Tratamento/kg</th><th className="p-2">Total</th></tr></thead><tbody>{categories.map(([key, label]) => { const rate = totals[key].rate; return <tr key={key} className="border-b"><td className="p-2 font-medium">{label}</td><td className="p-2">{brNumber(totals[key].onClient)}</td><td className="p-2">{brNumber(totals[key].exchanges)}</td><td className="p-2">{brNumber(totals[key].weight)}</td>{(["rental_rate", "exchange_rate", "treatment_rate"] as const).map((field) => <td key={field} className="p-2">{isAdmin ? <Input className="h-8 w-28" type="number" step="0.01" defaultValue={rate?.[field] ?? 0} onBlur={(e) => void saveRate(key, field, e.target.value)} /> : brMoney(Number(rate?.[field] ?? 0))}</td>)}<td className="p-2 font-semibold">{brMoney(totals[key].billing)}</td></tr>; })}</tbody><tfoot><tr><td colSpan={7} className="p-2 text-right font-semibold">Total</td><td className="p-2 font-bold">{brMoney(totalBilling)}</td></tr></tfoot></table></Card></TabsContent>
      <TabsContent value="declaracoes"><Card className="p-4"><h2 className="font-semibold">Declarações e rastreabilidade</h2><p className="mt-1 text-sm text-muted-foreground">Consolida MTRs, transportadores e destinadores por classe; o MTR deve acompanhar cada carga e a destinação deve ser registrada.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{(["class_ii", "class_i"] as const).map((wasteClass) => { const rows = movements.filter((item) => wasteClass === "class_i" ? ["class_i_mix", "borra_oleosa"].includes(item.waste_category) : !["class_i_mix", "borra_oleosa"].includes(item.waste_category)); const item = declarations.find((d) => d.waste_class === wasteClass); return <Card key={wasteClass} className="p-4"><h3 className="font-medium">Declaração Classe {wasteClass === "class_i" ? "I" : "II"}</h3><p className="mt-2 text-sm">Peso consolidado: <strong>{brNumber(rows.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0))} kg</strong></p><p className="mt-1 text-sm">MTRs: {rows.map((row) => row.mtr_number).filter(Boolean).join(", ") || item?.mtr_numbers || "Não informados"}</p><p className="mt-1 text-sm">Destinações: {[...new Set(rows.map((row) => row.destination_name).filter(Boolean))].join(", ") || item?.destination_name || "Não informadas"}</p></Card>; })}</div></Card></TabsContent>
      <TabsContent value="pesagens" className="space-y-4">{isAdmin && <Card className="p-4"><h2 className="font-semibold">Novo ticket de pesagem</h2><div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4"><Field label="Resíduo"><Select value={ticket.waste_category} onValueChange={(value) => setTicket({ ...ticket, waste_category: value as CategoryKey })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></Field><Field label="Número do ticket"><Input value={ticket.ticket_number} onChange={(e) => setTicket({ ...ticket, ticket_number: e.target.value })} /></Field><Field label="Data"><Input type="date" value={ticket.weighed_on} onChange={(e) => setTicket({ ...ticket, weighed_on: e.target.value })} /></Field><Field label="Placa"><Input value={ticket.vehicle_plate} onChange={(e) => setTicket({ ...ticket, vehicle_plate: e.target.value })} /></Field><Field label="Peso bruto (kg)"><Input type="number" value={ticket.gross_weight_kg} onChange={(e) => setTicket({ ...ticket, gross_weight_kg: e.target.value })} /></Field><Field label="Tara (kg)"><Input type="number" value={ticket.tare_weight_kg} onChange={(e) => setTicket({ ...ticket, tare_weight_kg: e.target.value })} /></Field><Field label="Peso líquido (kg)"><Input type="number" value={ticket.net_weight_kg} onChange={(e) => setTicket({ ...ticket, net_weight_kg: e.target.value })} /></Field><Button className="self-end" onClick={() => addTicket.mutate()}>Registrar ticket</Button></div></Card>}<Card className="overflow-x-auto p-4"><table className="min-w-[700px] w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Data</th><th className="p-2">Ticket</th><th className="p-2">Resíduo</th><th className="p-2">Placa</th><th className="p-2">Bruto</th><th className="p-2">Tara</th><th className="p-2">Líquido</th></tr></thead><tbody>{tickets.map((item) => <tr className="border-b" key={item.id}><td className="p-2">{item.weighed_on}</td><td className="p-2">{item.ticket_number || "—"}</td><td className="p-2">{categoryName(item.waste_category)}</td><td className="p-2">{item.vehicle_plate || "—"}</td><td className="p-2">{brNumber(Number(item.gross_weight_kg || 0))}</td><td className="p-2">{brNumber(Number(item.tare_weight_kg || 0))}</td><td className="p-2 font-medium">{brNumber(Number(item.net_weight_kg || 0))}</td></tr>)}{!tickets.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum ticket registrado.</td></tr>}</tbody></table></Card></TabsContent>
      <TabsContent value="relatorios"><Card className="p-5"><h2 className="font-semibold">Relatório mensal consolidado</h2><p className="mt-2 text-sm text-muted-foreground">O PDF consolida indicadores, categorias, pesos, faturamento, MTRs e destinações para o período selecionado.</p><Button className="mt-4" onClick={() => void exportPdf()}><Download className="mr-2 h-4 w-4" />Gerar PDF do relatório</Button></Card></TabsContent>
    </Tabs>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><Label>{label}</Label><div className="mt-1">{children}</div></div>; }
function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <Card className="p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{title}</span>{icon}</div><p className="mt-2 text-xl font-bold">{value}</p></Card>; }
function MovementTable({ movements, onDelete }: { movements: Movement[]; onDelete?: (id: string) => void }) { return <Card className="overflow-x-auto p-4"><table className="min-w-[960px] w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Data</th><th className="p-2">Resíduo</th><th className="p-2">OS</th><th className="p-2">Colocada</th><th className="p-2">Removida</th><th className="p-2">Trocas</th><th className="p-2">Peso</th><th className="p-2">MTR</th><th className="p-2">Destinação</th>{onDelete && <th className="p-2" />}</tr></thead><tbody>{movements.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{item.occurred_on}</td><td className="p-2">{categoryName(item.waste_category)}</td><td className="p-2">{item.service_order || "—"}</td><td className="p-2">{brNumber(Number(item.placed_quantity || 0))}</td><td className="p-2">{brNumber(Number(item.removed_quantity || 0))}</td><td className="p-2">{brNumber(Number(item.removed_quantity || 0))}</td><td className="p-2">{brNumber(Number(item.weight_kg || 0))} kg</td><td className="p-2">{item.mtr_number || "—"}</td><td className="p-2">{item.destination_name || "—"}</td>{onDelete && <td className="p-2"><Button variant="ghost" size="icon" onClick={() => onDelete(item.id)} title="Excluir movimentação"><Trash2 className="h-4 w-4 text-destructive" /></Button></td>}</tr>)}{!movements.length && <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Nenhuma movimentação registrada.</td></tr>}</tbody></table></Card>; }
