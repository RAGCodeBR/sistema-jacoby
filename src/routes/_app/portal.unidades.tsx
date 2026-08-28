import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Mail, Phone, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/portal/unidades")({ component: PortalUnits });
type Branch = { id: string; name: string; cnpj: string | null; legal_name: string | null; address: string | null; responsible: string | null; phone: string | null; email: string | null };

function UnitCard({ title, cnpj, legalName, address, responsible, phone, email, matrix = false }: { title: string; cnpj?: string | null; legalName?: string | null; address?: string | null; responsible?: string | null; phone?: string | null; email?: string | null; matrix?: boolean }) {
  return <Card className="p-5"><div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{matrix ? "Matriz" : "Filial / pátio"}{cnpj ? ` · CNPJ ${cnpj}` : " · CNPJ não informado"}</p></div></div>{legalName && <p className="mb-3 text-sm">{legalName}</p>}<div className="space-y-2 text-sm text-muted-foreground">{address && <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{address}</p>}{responsible && <p className="flex gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0" />{responsible}</p>}{phone && <p className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" />{phone}</p>}{email && <p className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" />{email}</p>}{!address && !responsible && !phone && !email && <p>Dados de contato ainda não cadastrados.</p>}</div></Card>;
}
function PortalUnits() {
  const { isClient, clientId: linkedClientId } = useAuth(); const { data: clients = [] } = useClients(); const [clientId, setClientId] = useState("");
  useEffect(() => { if (isClient) setClientId(linkedClientId ?? ""); else if (!clientId && clients[0]) setClientId(clients[0].id); }, [isClient, linkedClientId, clientId, clients]);
  const client = clients.find((item) => item.id === clientId);
  const { data: branches = [], isLoading } = useQuery({ queryKey: ["client-branches", clientId], enabled: !!clientId, queryFn: async () => { const { data, error } = await (supabase.from("client_branches") as any).select("*").eq("client_id", clientId).eq("is_active", true).order("name"); if (error) throw error; return (data ?? []) as Branch[]; } });
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6"><header><p className="text-sm font-medium text-primary">Portal do Cliente</p><h1 className="text-2xl font-bold">Unidades, filiais e pátios</h1><p className="text-sm text-muted-foreground">Consulte a matriz e todas as unidades vinculadas a este acesso.</p></header>{!isClient && <Card className="p-4"><Select value={clientId} onValueChange={setClientId}><SelectTrigger className="max-w-md"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger><SelectContent>{clients.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Card>}<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{client && <UnitCard matrix title={client.trade_name || client.name} cnpj={client.cnpj} legalName={client.legal_name} address={client.address} responsible={client.responsible} phone={client.phone} email={client.email} />}{branches.map((branch) => <UnitCard key={branch.id} title={branch.name} cnpj={branch.cnpj} legalName={branch.legal_name} address={branch.address} responsible={branch.responsible} phone={branch.phone} email={branch.email} />)}</div>{clientId && !isLoading && !branches.length && <Card className="p-5 text-sm text-muted-foreground">Esta empresa ainda não possui filiais ou pátios cadastrados. A matriz está apresentada acima.</Card>}</div>;
}
