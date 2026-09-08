/** Faturamento 2: fluxo mensal independente, espelhando o boletim operacional. */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useClients } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Branch = { id: string; name: string; cnpj: string | null; address: string | null };
type Equipment = {
  id: string;
  identification: string | null;
  name: string;
  equipment_type: string;
  active: boolean;
};
type Residue = { id: string; name: string; active: boolean };
type Cycle = {
  id: string;
  client_id: string;
  period_start: string;
  period_end: string;
  status: string;
};
type Placement = {
  id: string;
  branch_id: string;
  equipment_id: string;
  waste_residue_id: string | null;
  started_on: string;
  ended_on: string | null;
  quantity: number;
  monthly_rental_rate: number;
  observation: string | null;
};
type Movement = {
  id: string;
  branch_id: string;
  equipment_id: string | null;
  replacement_equipment_id: string | null;
  waste_residue_id: string | null;
  occurred_on: string;
  service_order: string | null;
  placed_quantity: number;
  removed_quantity: number;
  weight_kg: number;
  observation: string | null;
};
type Rates = { id: string; exchange_rate: number; treatment_rate: number };

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value || 0);
const monthBounds = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return { start: `${month}-01`, end: new Date(year, index, 0).toISOString().slice(0, 10) };
};
const equipmentName = (item?: Equipment) =>
  item
    ? [item.identification, item.name, item.equipment_type].filter(Boolean).join(" · ")
    : "Equipamento";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function BillingV2Module() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [cycleId, setCycleId] = useState("");
  const [tab, setTab] = useState("locacoes");
  const [placementForm, setPlacementForm] = useState({
    branchId: "",
    equipmentId: "",
    residueId: "",
    date: new Date().toISOString().slice(0, 10),
    quantity: "1",
    observation: "",
  });
  const [movementForm, setMovementForm] = useState({
    branchId: "",
    equipmentId: "",
    replacementEquipmentId: "",
    residueId: "",
    date: new Date().toISOString().slice(0, 10),
    order: "",
    placed: "0",
    removed: "0",
    weight: "0",
    observation: "",
  });
  const [ratesForm, setRatesForm] = useState({ exchange: "0", treatment: "0" });
  const bounds = monthBounds(month);

  useEffect(() => {
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clientId, clients]);
  const query = <T,>(key: unknown[], table: string, configure: (request: any) => any) =>
    useQuery({
      queryKey: key,
      enabled: Boolean(clientId),
      queryFn: async () => {
        const { data, error } = await configure(supabase.from(table as any) as any);
        if (error) throw error;
        return (data || []) as T[];
      },
    });
  const cyclesQuery = query<Cycle>(["billing-v2-cycles", clientId], "billing_v2_cycles", (q) =>
    q.select("*").eq("client_id", clientId).order("period_start", { ascending: false }),
  );
  const branchesQuery = query<Branch>(["billing-v2-branches", clientId], "client_branches", (q) =>
    q.select("id,name,cnpj,address").eq("client_id", clientId).eq("is_active", true).order("name"),
  );
  const equipmentQuery = query<Equipment>(
    ["billing-v2-equipment", clientId],
    "waste_equipment",
    (q) =>
      q
        .select("id,identification,name,equipment_type,active")
        .eq("client_id", clientId)
        .eq("active", true)
        .order("name"),
  );
  const residuesQuery = query<Residue>(["billing-v2-residues", clientId], "waste_residues", (q) =>
    q.select("id,name,active").eq("client_id", clientId).eq("active", true).order("name"),
  );
  const cycle = (cyclesQuery.data || []).find((item) => item.id === cycleId);
  const placementsQuery = useQuery({
    queryKey: ["billing-v2-placements", clientId, bounds.end],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_placements" as any) as any)
        .select("*")
        .eq("client_id", clientId)
        .lte("started_on", bounds.end)
        .or(`ended_on.is.null,ended_on.gt.${bounds.end}`)
        .order("started_on");
      if (error) throw error;
      return (data || []) as Placement[];
    },
  });
  const movementsQuery = useQuery({
    queryKey: ["billing-v2-movements", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_movements" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId)
        .order("occurred_on");
      if (error) throw error;
      return (data || []) as Movement[];
    },
  });
  const ratesQuery = useQuery({
    queryKey: ["billing-v2-rates", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_rates" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId)
        .maybeSingle();
      if (error) throw error;
      return data as Rates | null;
    },
  });
  const clientSettingsQuery = useQuery({
    queryKey: ["billing-v2-client-settings", clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("waste_client_billing_settings" as any) as any)
        .select("exchange_rate,treatment_rate,rental_rate")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as { exchange_rate: number; treatment_rate: number; rental_rate: number } | null;
    },
  });
  const branches = branchesQuery.data || [],
    equipment = equipmentQuery.data || [],
    residues = residuesQuery.data || [],
    placements = placementsQuery.data || [],
    movements = movementsQuery.data || [];
  useEffect(() => {
    if (ratesQuery.data)
      setRatesForm({
        exchange: String(ratesQuery.data.exchange_rate || 0),
        treatment: String(ratesQuery.data.treatment_rate || 0),
      });
  }, [ratesQuery.data]);

  const openCycle = useMutation({
    mutationFn: async () => {
      if (!clientId) throw Error("Selecione um cliente.");
      const { start, end } = monthBounds(month);
      const { data: existing, error: findError } = await (
        supabase.from("billing_v2_cycles" as any) as any
      )
        .select("id")
        .eq("client_id", clientId)
        .eq("period_start", start)
        .maybeSingle();
      if (findError) throw findError;
      if (existing) return existing.id as string;
      const { data, error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .insert({ client_id: clientId, period_start: start, period_end: end })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setCycleId(id);
      qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] });
      toast.success("Competência aberta para edição.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["billing-v2-placements", clientId] });
    qc.invalidateQueries({ queryKey: ["billing-v2-movements", cycleId] });
    qc.invalidateQueries({ queryKey: ["billing-v2-rates", cycleId] });
  };
  const addPlacement = useMutation({
    mutationFn: async () => {
      if (!placementForm.branchId || !placementForm.equipmentId)
        throw Error("Informe filial/pátio e equipamento.");
      const { error } = await (supabase.from("billing_v2_placements" as any) as any).insert({
        client_id: clientId,
        branch_id: placementForm.branchId,
        equipment_id: placementForm.equipmentId,
        waste_residue_id: placementForm.residueId || null,
        started_on: placementForm.date,
        quantity: Number(placementForm.quantity || 0),
        monthly_rental_rate: Number(clientSettingsQuery.data?.rental_rate || 0),
        observation: placementForm.observation || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPlacementForm({
        ...placementForm,
        equipmentId: "",
        residueId: "",
        quantity: "1",
        observation: "",
      });
      refresh();
      toast.success("Equipamento incluído em locação.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const addMovement = useMutation({
    mutationFn: async () => {
      if (!cycleId || !movementForm.branchId)
        throw Error("Abra a competência e informe a filial/pátio.");
      const removed = Number(movementForm.removed || 0);
      if (removed > 0 && !movementForm.equipmentId)
        throw Error("Selecione o equipamento removido.");
      if (movementForm.replacementEquipmentId && removed <= 0)
        throw Error("Informe a quantidade removida para registrar a troca.");
      const { error } = await (supabase.from("billing_v2_movements" as any) as any).insert({
        cycle_id: cycleId,
        branch_id: movementForm.branchId,
        equipment_id: movementForm.equipmentId || null,
        replacement_equipment_id: movementForm.replacementEquipmentId || null,
        waste_residue_id: movementForm.residueId || null,
        occurred_on: movementForm.date,
        service_order: movementForm.order || null,
        placed_quantity: Number(movementForm.placed || 0),
        removed_quantity: removed,
        weight_kg: Number(movementForm.weight || 0),
        observation: movementForm.observation || null,
      });
      if (error) throw error;
      if (movementForm.replacementEquipmentId) {
        const { data: activePlacement, error: findPlacementError } = await (
          supabase.from("billing_v2_placements" as any) as any
        )
          .select("id,quantity,started_on,monthly_rental_rate,waste_residue_id,observation")
          .eq("client_id", clientId)
          .eq("branch_id", movementForm.branchId)
          .eq("equipment_id", movementForm.equipmentId)
          .is("ended_on", null)
          .order("started_on", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (findPlacementError) throw findPlacementError;
        if (!activePlacement) {
          throw Error("Não foi encontrada uma locação ativa para o equipamento removido.");
        }
        const activeQuantity = Number(activePlacement.quantity || 0);
        if (removed > activeQuantity) {
          throw Error("A quantidade removida é maior que a quantidade em locação deste equipamento.");
        }
        // A troca não soma uma locação: ela apenas substitui o equipamento no mesmo saldo.
        if (removed === activeQuantity) {
          const { error: replaceError } = await (
            supabase.from("billing_v2_placements" as any) as any
          )
            .update({ equipment_id: movementForm.replacementEquipmentId })
            .eq("id", activePlacement.id);
          if (replaceError) throw replaceError;
        } else {
          const { error: reduceError } = await (supabase.from("billing_v2_placements" as any) as any)
            .update({ quantity: activeQuantity - removed })
            .eq("id", activePlacement.id);
          if (reduceError) throw reduceError;
          const { error: replacementError } = await (
            supabase.from("billing_v2_placements" as any) as any
          ).insert({
            client_id: clientId,
            branch_id: movementForm.branchId,
            equipment_id: movementForm.replacementEquipmentId,
            waste_residue_id: activePlacement.waste_residue_id,
            started_on: activePlacement.started_on,
            quantity: removed,
            monthly_rental_rate: Number(activePlacement.monthly_rental_rate || 0),
            observation: activePlacement.observation,
          });
          if (replacementError) throw replacementError;
        }
      }
    },
    onSuccess: () => {
      setMovementForm({
        ...movementForm,
        equipmentId: "",
        replacementEquipmentId: "",
        residueId: "",
        order: "",
        placed: "0",
        removed: "0",
        weight: "0",
        observation: "",
      });
      refresh();
      toast.success("Movimentação registrada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveRates = useMutation({
    mutationFn: async () => {
      if (!cycleId) throw Error("Abra a competência antes de definir os valores.");
      const { error } = await (supabase.from("billing_v2_rates" as any) as any).upsert(
        {
          cycle_id: cycleId,
          exchange_rate: Number(ratesForm.exchange || 0),
          treatment_rate: Number(ratesForm.treatment || 0),
        },
        { onConflict: "cycle_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Valores do boletim salvos.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = async (table: string, id: string) => {
    if (!confirm("Excluir este lançamento?") || !id) return;
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };
  const fixedRates = {
    rental_rate: Number(clientSettingsQuery.data?.rental_rate || 0),
    exchange_rate: Number(clientSettingsQuery.data?.exchange_rate || 0),
    treatment_rate: Number(clientSettingsQuery.data?.treatment_rate || 0),
  };
  const totals = useMemo(() => {
    const rental = placements.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.monthly_rental_rate || 0),
      0,
    );
    const exchanges = movements.reduce((sum, item) => sum + Number(item.removed_quantity || 0), 0);
    const weight = movements.reduce((sum, item) => sum + Number(item.weight_kg || 0), 0);
    const exchange = exchanges * fixedRates.exchange_rate;
    const treatment = weight * fixedRates.treatment_rate;
    return { rental, exchanges, weight, exchange, treatment, total: rental + exchange + treatment };
  }, [placements, movements, fixedRates.exchange_rate, fixedRates.treatment_rate]);
  const clientName = clients.find((item) => item.id === clientId)?.name || "Cliente";
  const branch = (id: string) => branches.find((item) => item.id === id);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Portal do Cliente</p>
        <h1 className="text-2xl font-bold">Faturamento 2</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Novo fluxo mensal baseado no boletim: locação, troca e tratamento por kg.
        </p>
      </header>
      <Card className="grid gap-3 p-4 md:grid-cols-3">
        <Field label="Cliente">
          <Select
            value={clientId}
            onValueChange={(value) => {
              setClientId(value);
              setCycleId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Competência">
          <Input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setCycleId("");
            }}
          />
        </Field>
        <Button className="self-end" onClick={() => openCycle.mutate()}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          {cycleId ? "Abrir competência" : "Criar ou abrir competência"}
        </Button>
      </Card>
      {!cycleId ? (
        <Card className="p-6 text-sm text-muted-foreground">
          Selecione o cliente, a competência e clique em “Criar ou abrir competência”. O faturamento
          atual permanece separado.
        </Card>
      ) : (
        <>
          <Card className="grid gap-3 p-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-semibold">{clientName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Período</p>
              <p className="font-semibold">
                {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
                  new Date(`${month}-02T12:00:00`),
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total do boletim</p>
              <p className="font-semibold text-primary">{money(totals.total)}</p>
            </div>
            <Button variant="outline" className="self-end" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir boletim
            </Button>
          </Card>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto">
              <TabsTrigger value="locacoes">Equipamentos em locação</TabsTrigger>
              <TabsTrigger value="movimentos">Movimentações</TabsTrigger>
              <TabsTrigger value="boletim">Boletim</TabsTrigger>
            </TabsList>
            <TabsContent value="locacoes" className="space-y-4">
              <Card className="p-4">
                <h2 className="font-semibold">Nova colocação em locação</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  O valor de locação é fixo por cliente e vem de Configurações de movimentação →
                  Valores de locação.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Field label="Filial ou pátio">
                    <Select
                      value={placementForm.branchId}
                      onValueChange={(value) =>
                        setPlacementForm({ ...placementForm, branchId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Equipamento">
                    <Select
                      value={placementForm.equipmentId}
                      onValueChange={(value) =>
                        setPlacementForm({ ...placementForm, equipmentId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {equipmentName(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Resíduo">
                    <Select
                      value={placementForm.residueId}
                      onValueChange={(value) =>
                        setPlacementForm({ ...placementForm, residueId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {residues.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Início">
                    <Input
                      type="date"
                      value={placementForm.date}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Quantidade">
                    <Input
                      type="number"
                      min="1"
                      value={placementForm.quantity}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, quantity: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Observação">
                    <Input
                      value={placementForm.observation}
                      onChange={(event) =>
                        setPlacementForm({ ...placementForm, observation: event.target.value })
                      }
                    />
                  </Field>
                  <Button className="self-end" onClick={() => addPlacement.mutate()}>
                    Registrar locação
                  </Button>
                </div>
              </Card>
              <PlacementTable
                rows={placements}
                branches={branches}
                equipment={equipment}
                residues={residues}
                onDelete={(id) => void remove("billing_v2_placements", id)}
              />
            </TabsContent>
            <TabsContent value="movimentos" className="space-y-4">
              <Card className="p-4">
                <h2 className="font-semibold">Movimentação da competência</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  As removidas formam as trocas. Ao informar o equipamento da troca, a locação
                  anterior é encerrada e a nova inicia com o valor fixo do cliente.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Field label="Filial ou pátio">
                    <Select
                      value={movementForm.branchId}
                      onValueChange={(value) =>
                        setMovementForm({ ...movementForm, branchId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Equipamento removido">
                    <Select
                      value={movementForm.equipmentId}
                      onValueChange={(value) =>
                        setMovementForm({ ...movementForm, equipmentId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione quando houver troca" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {equipmentName(item)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Equipamento da troca">
                    <Select
                      value={movementForm.replacementEquipmentId}
                      onValueChange={(value) =>
                        setMovementForm({ ...movementForm, replacementEquipmentId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment
                          .filter((item) => item.id !== movementForm.equipmentId)
                          .map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {equipmentName(item)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Resíduo">
                    <Select
                      value={movementForm.residueId}
                      onValueChange={(value) =>
                        setMovementForm({ ...movementForm, residueId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {residues.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Data">
                    <Input
                      type="date"
                      value={movementForm.date}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Ordem de serviço">
                    <Input
                      value={movementForm.order}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, order: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Colocadas">
                    <Input
                      type="number"
                      min="0"
                      value={movementForm.placed}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, placed: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Removidas / trocas">
                    <Input
                      type="number"
                      min="0"
                      value={movementForm.removed}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, removed: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Peso (kg)">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementForm.weight}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, weight: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Observação">
                    <Input
                      value={movementForm.observation}
                      onChange={(event) =>
                        setMovementForm({ ...movementForm, observation: event.target.value })
                      }
                    />
                  </Field>
                  <Button className="self-end" onClick={() => addMovement.mutate()}>
                    Registrar movimentação
                  </Button>
                </div>
              </Card>
              <MovementTable
                rows={movements}
                branches={branches}
                equipment={equipment}
                residues={residues}
                onDelete={(id) => void remove("billing_v2_movements", id)}
              />
            </TabsContent>
            <TabsContent value="boletim" className="space-y-4">
              <Card className="p-4">
                <h2 className="font-semibold">Valores aplicados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Troca e tratamento são valores fixos deste cliente e devem ser alterados em
                  Configurações de movimentação.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border p-3 text-sm">
                    Locação: <strong>{money(fixedRates.rental_rate)} / equipamento</strong>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    Troca: <strong>{money(fixedRates.exchange_rate)}</strong>
                  </div>
                  <div className="rounded-md border p-3 text-sm">
                    Tratamento: <strong>{money(fixedRates.treatment_rate)} / kg</strong>
                  </div>
                </div>
              </Card>
              <Boletim
                client={clientName}
                cycle={cycle}
                branches={branches}
                placements={placements}
                movements={movements}
                equipment={equipment}
                residues={residues}
                totals={totals}
                rate={{ id: "fixed", ...fixedRates }}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function PlacementTable({
  rows,
  branches,
  equipment,
  residues,
  onDelete,
}: {
  rows: Placement[];
  branches: Branch[];
  equipment: Equipment[];
  residues: Residue[];
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Início</th>
            <th className="p-2">Filial/pátio</th>
            <th className="p-2">Equipamento que saiu</th>
            <th className="p-2">Equipamento que entrou</th>
            <th className="p-2">Resíduo</th>
            <th className="p-2">Quantidade</th>
            <th className="p-2">Locação mensal</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">
                  {new Date(`${row.started_on}T12:00:00`).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">
                  {branches.find((item) => item.id === row.branch_id)?.name || "—"}
                </td>
                <td className="p-2">
                  {equipmentName(equipment.find((item) => item.id === row.equipment_id))}
                </td>
                <td className="p-2">
                  {residues.find((item) => item.id === row.waste_residue_id)?.name || "—"}
                </td>
                <td className="p-2">{number(Number(row.quantity))}</td>
                <td className="p-2">{money(Number(row.monthly_rental_rate))}</td>
                <td className="p-2">
                  <Button variant="ghost" size="icon" onClick={() => onDelete(row.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-5 text-center text-muted-foreground" colSpan={7}>
                Nenhum equipamento em locação nesta competência.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
function MovementTable({
  rows,
  branches,
  equipment,
  residues,
  onDelete,
}: {
  rows: Movement[];
  branches: Branch[];
  equipment: Equipment[];
  residues: Residue[];
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="p-2">Data</th>
            <th className="p-2">OS</th>
            <th className="p-2">Filial/pátio</th>
            <th className="p-2">Equipamento</th>
            <th className="p-2">Resíduo</th>
            <th className="p-2">Colocadas</th>
            <th className="p-2">Removidas</th>
            <th className="p-2">Peso</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="p-2">
                  {new Date(`${row.occurred_on}T12:00:00`).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-2">{row.service_order || "—"}</td>
                <td className="p-2">
                  {branches.find((item) => item.id === row.branch_id)?.name || "—"}
                </td>
                <td className="p-2">
                  {equipmentName(equipment.find((item) => item.id === row.equipment_id || ""))}
                </td>
                <td className="p-2">
                  {row.replacement_equipment_id
                    ? equipmentName(
                        equipment.find((item) => item.id === row.replacement_equipment_id || ""),
                      )
                    : "—"}
                </td>
                <td className="p-2">
                  {residues.find((item) => item.id === row.waste_residue_id)?.name || "—"}
                </td>
                <td className="p-2">{number(Number(row.placed_quantity))}</td>
                <td className="p-2">{number(Number(row.removed_quantity))}</td>
                <td className="p-2">{number(Number(row.weight_kg))} kg</td>
                <td className="p-2">
                  <Button variant="ghost" size="icon" onClick={() => onDelete(row.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="p-5 text-center text-muted-foreground" colSpan={10}>
                Nenhuma movimentação nesta competência.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
function Boletim({
  client,
  cycle,
  branches,
  placements,
  movements,
  equipment,
  residues,
  totals,
  rate,
}: {
  client: string;
  cycle?: Cycle;
  branches: Branch[];
  placements: Placement[];
  movements: Movement[];
  equipment: Equipment[];
  residues: Residue[];
  totals: {
    rental: number;
    exchanges: number;
    weight: number;
    exchange: number;
    treatment: number;
    total: number;
  };
  rate: Rates | null | undefined;
}) {
  const branchIds = Array.from(
    new Set([...placements, ...movements].map((item) => item.branch_id)),
  );
  return (
    <Card className="space-y-5 p-5 print:border-0 print:shadow-none">
      <div>
        <p className="text-sm font-medium text-primary">Jacoby Soluções Ambientais</p>
        <h2 className="text-xl font-bold">Boletim de medição</h2>
        <p className="text-sm text-muted-foreground">
          {client} ·{" "}
          {cycle
            ? `${new Date(`${cycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${cycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}`
            : ""}
        </p>
      </div>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="font-semibold">Filiais e pátios incluídos</p>
        <p className="mt-1 text-muted-foreground">
          {branchIds
            .map((id) => branches.find((item) => item.id === id)?.name)
            .filter(Boolean)
            .join(" · ") || "Nenhuma movimentação ou locação registrada."}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Serviço</th>
            <th className="py-2">Quantidade</th>
            <th className="py-2">Valor unitário</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Locação de equipamentos</td>
            <td className="py-2">
              {placements.reduce((sum, item) => sum + Number(item.quantity), 0)}
            </td>
            <td className="py-2">Conforme colocação</td>
            <td className="py-2 text-right">{money(totals.rental)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Troca de equipamentos</td>
            <td className="py-2">{number(totals.exchanges)}</td>
            <td className="py-2">{money(Number(rate?.exchange_rate || 0))}</td>
            <td className="py-2 text-right">{money(totals.exchange)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Tratamento de resíduos</td>
            <td className="py-2">{number(totals.weight)} kg</td>
            <td className="py-2">{money(Number(rate?.treatment_rate || 0))} / kg</td>
            <td className="py-2 text-right">{money(totals.treatment)}</td>
          </tr>
        </tbody>
      </table>
      <div className="ml-auto w-full max-w-xs rounded-lg bg-primary/10 p-4 text-right">
        <p className="text-xs font-medium uppercase text-primary">Faturamento total</p>
        <p className="mt-1 text-2xl font-bold text-primary">{money(totals.total)}</p>
      </div>
    </Card>
  );
}
