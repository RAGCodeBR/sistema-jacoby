import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/portal/boletins")({ component: ClientBulletinsPage });

type Bulletin = { id: string; bulletin_number: number; branch_id: string | null; period_start: string; period_end: string; finalized_at: string | null; client_branches?: { name: string | null } | null; billing_v2_cycle_services?: { waste_services?: { name: string | null } | null }[] };
type Movement = { occurred_on: string; weight_kg: number; service_order: string | null; waste_residues?: { name: string | null } | null };

const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");

function ClientBulletinsPage() {
  const { clientId } = useAuth();
  const { data: bulletins = [], isLoading } = useQuery({
    queryKey: ["portal-published-bulletins", clientId], enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycles") as any)
        .select("id,bulletin_number,branch_id,period_start,period_end,finalized_at,client_branches(name),billing_v2_cycle_services(waste_services(name))")
        .eq("client_id", clientId).eq("status", "closed").eq("client_portal_visible", true).order("finalized_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bulletin[];
    },
  });

  const generatePdf = async (bulletin: Bulletin, openOnly = false) => {
    const { data: movements, error } = await (supabase.from("billing_v2_movements") as any)
      .select("occurred_on,weight_kg,service_order,waste_residues(name)")
      .eq("cycle_id", bulletin.id).eq("confirmed", true).order("occurred_on");
    if (error) return toast.error(error.message);
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    const services = Array.from(new Set((bulletin.billing_v2_cycle_services ?? []).map((item) => item.waste_services?.name).filter(Boolean))) as string[];
    const items = (movements ?? []) as Movement[];
    pdf.setFillColor(47, 111, 67); pdf.rect(0, 0, 210, 38, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("BOLETIM DE MEDIÇÃO", 105, 17, { align: "center" });
    pdf.setFontSize(11); pdf.text(`BOLETIM #${String(bulletin.bulletin_number).padStart(3, "0")}`, 105, 26, { align: "center" });
    pdf.setTextColor(40, 55, 45); pdf.setFontSize(11); pdf.text(`Unidade: ${bulletin.client_branches?.name || "Matriz"}`, 16, 53);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.text(`Período: ${date(bulletin.period_start)} a ${date(bulletin.period_end)}`, 16, 61);
    let y = 76;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Serviços incluídos", 16, y); y += 8;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    (services.length ? services : ["Serviços operacionais do período"]).forEach((service) => { pdf.text(`• ${service}`, 20, y); y += 7; });
    y += 6; pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.text("Movimentações confirmadas", 16, y); y += 8;
    pdf.setFillColor(235, 245, 234); pdf.rect(16, y - 5, 178, 8, "F"); pdf.setFontSize(8); pdf.text("DATA", 20, y); pdf.text("RESÍDUO", 60, y); pdf.text("OS", 125, y); pdf.text("PESO", 190, y, { align: "right" }); y += 8;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
    if (!items.length) pdf.text("Nenhuma movimentação confirmada neste boletim.", 20, y);
    items.forEach((movement) => { if (y > 275) { pdf.addPage(); y = 20; } pdf.text(date(movement.occurred_on), 20, y); pdf.text((movement.waste_residues?.name || "Resíduo não informado").slice(0, 34), 60, y); pdf.text((movement.service_order || "—").slice(0, 18), 125, y); pdf.text(`${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(movement.weight_kg || 0))} kg`, 190, y, { align: "right" }); y += 8; });
    pdf.setFontSize(8); pdf.setTextColor(93, 112, 97); pdf.text("Visualização operacional do cliente — sem valores comerciais.", 105, 288, { align: "center" });
    const blob = pdf.output("blob"); const url = URL.createObjectURL(blob);
    if (openOnly) window.open(url, "_blank", "noopener,noreferrer");
    else { const link = document.createElement("a"); link.href = url; link.download = `Boletim-${String(bulletin.bulletin_number).padStart(3, "0")}.pdf`; link.click(); }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"><header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Boletins emitidos</h1><p className="text-sm text-muted-foreground">Consulte e baixe os boletins disponibilizados pela equipe Jacoby. Os valores comerciais não são exibidos.</p></header><Card className="overflow-hidden">{isLoading ? <p className="p-8 text-sm text-muted-foreground">Carregando boletins...</p> : bulletins.length ? <div className="divide-y">{bulletins.map((bulletin) => { const services = Array.from(new Set((bulletin.billing_v2_cycle_services ?? []).map((item) => item.waste_services?.name).filter(Boolean))); return <div key={bulletin.id} className="flex flex-wrap items-center gap-4 p-5"><FileText className="h-6 w-6 text-primary" /><div className="min-w-0 flex-1"><p className="font-semibold">Boletim #{String(bulletin.bulletin_number).padStart(3, "0")}</p><p className="text-sm text-muted-foreground">{bulletin.client_branches?.name || "Matriz"} · {date(bulletin.period_start)} a {date(bulletin.period_end)}</p>{services.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Serviços: {services.join(" · ")}</p>}</div><div className="flex gap-2"><Button variant="outline" onClick={() => void generatePdf(bulletin, true)}><Eye className="mr-2 h-4 w-4" />Visualizar</Button><Button onClick={() => void generatePdf(bulletin)}><Download className="mr-2 h-4 w-4" />Baixar PDF</Button></div></div>; })}</div> : <p className="p-10 text-center text-sm text-muted-foreground">Nenhum boletim foi disponibilizado para consulta.</p>}</Card></div>;
}
