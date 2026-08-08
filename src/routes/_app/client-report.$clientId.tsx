import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Printer } from "lucide-react";
import { useClients } from "@/hooks/use-data";
import { generateClientReport } from "@/lib/client-report.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/client-report/$clientId")({
  component: ClientReportPage,
});

function ClientReportPage() {
  const { clientId } = Route.useParams();
  const { data: clients = [] } = useClients();
  const client = clients.find((c) => c.id === clientId);
  const generate = useServerFn(generateClientReport);
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string>("");
  const [stats, setStats] = useState<{ total: number; done: number; pending: number } | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await generate({ data: { clientId } });
      setHtml(r.html);
      setStats(r.stats);
    } catch (e) {
      toast.error((e as Error).message || "Falha ao gerar relatório");
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Relatório — ${client?.name ?? ""}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;padding:32px;max-width:900px;margin:auto;line-height:1.5}
        h1{border-bottom:2px solid #0f172a;padding-bottom:8px}
        h2{margin-top:24px;color:#1e3a8a}
        table{border-collapse:collapse;width:100%;margin:12px 0}
        th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left;font-size:13px}
        th{background:#f1f5f9}
        ul,ol{padding-left:22px}
      </style></head><body>
      <h1>Relatório — ${client?.name ?? ""}</h1>
      ${html}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/clients"><ArrowLeft className="mr-1 h-4 w-4" />Clientes</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Relatório IA — {client?.name ?? "…"}</h1>
        </div>
        <div className="flex gap-2">
          {html && (
            <Button variant="outline" size="sm" onClick={print}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
          )}
          <Button size="sm" onClick={run} disabled={loading}>
            <Sparkles className="mr-1 h-4 w-4" />
            {loading ? "Gerando…" : html ? "Regerar" : "Gerar relatório"}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></Card>
          <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">Concluídas</p><p className="text-xl font-bold text-emerald-600">{stats.done}</p></Card>
          <Card className="p-3 text-center"><p className="text-xs text-muted-foreground">Pendentes</p><p className="text-xl font-bold text-amber-600">{stats.pending}</p></Card>
        </div>
      )}

      <Card className="p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Analisando todas as tarefas, observações e subtarefas do cliente… isso pode levar alguns segundos.</p>
        ) : html ? (
          <div
            className="prose prose-sm max-w-none [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-primary [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Clique em <strong>Gerar relatório</strong> para uma transcrição inteligente de tudo que foi feito para este cliente.
          </div>
        )}
      </Card>
    </div>
  );
}
