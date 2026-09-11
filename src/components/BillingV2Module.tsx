/** Faturamento 2: fluxo mensal independente, espelhando o boletim operacional. */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FilePlus2, Trash2 } from "lucide-react";
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
import jacobyLogo from "@/assets/jacoby-logo-transparent.png";

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
  issuer_type: "jacoby" | "outsourced";
  outsourced_company_id: string | null;
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
type Service = { id: string; name: string; active: boolean };
type OutsourcedCompany = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  logo_url: string | null;
  cnpj: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  environmental_license: string | null;
};
type OutsourcedCompanyService = { outsourced_company_id: string; waste_service_id: string };
type CycleService = { id: string; cycle_id: string; waste_service_id: string; outsourced_company_id: string | null; amount: number };
type CompanyProfile = {
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  address: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  environmental_license: string | null;
  logo_url: string | null;
};

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
const logoAsDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw Error("Logo indisponível");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

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
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceAmount, setServiceAmount] = useState("0");
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
  const servicesQuery = query<Service>(["billing-v2-services", clientId], "waste_services", (q) =>
    q.select("id,name,active").eq("client_id", clientId).eq("active", true).order("name"),
  );
  const outsourcedCompaniesQuery = useQuery({
    queryKey: ["outsourced-companies"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_companies" as any) as any)
        .select("id,legal_name,trade_name,logo_url,cnpj,address,postal_code,phone,email,environmental_license")
        .eq("active", true)
        .order("legal_name");
      if (error) throw error;
      return (data || []) as OutsourcedCompany[];
    },
  });
  const outsourcedCompanyServicesQuery = useQuery({
    queryKey: ["outsourced-company-services"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("outsourced_company_services" as any) as any)
        .select("outsourced_company_id,waste_service_id");
      if (error) throw error;
      return (data || []) as OutsourcedCompanyService[];
    },
  });
  const companyProfileQuery = useQuery({
    queryKey: ["company-profile"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("company_profiles" as any) as any)
        .select("legal_name,trade_name,cnpj,address,postal_code,phone,email,environmental_license,logo_url")
        .eq("is_primary", true)
        .maybeSingle();
      if (error) throw error;
      return data as CompanyProfile | null;
    },
  });
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
  const cycleServicesQuery = useQuery({
    queryKey: ["billing-v2-cycle-services", cycleId],
    enabled: Boolean(cycleId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
        .select("*")
        .eq("cycle_id", cycleId);
      if (error) throw error;
      return (data || []) as CycleService[];
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
    movements = movementsQuery.data || [],
    services = servicesQuery.data || [],
    outsourcedCompanies = outsourcedCompaniesQuery.data || [],
    outsourcedCompanyServices = outsourcedCompanyServicesQuery.data || [],
    cycleServices = cycleServicesQuery.data || [],
    companyProfile = companyProfileQuery.data || null;
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
    qc.invalidateQueries({ queryKey: ["billing-v2-cycle-services", cycleId] });
  };
  const saveIssuer = useMutation({
    mutationFn: async ({ issuerType, companyId }: { issuerType: "jacoby" | "outsourced"; companyId: string }) => {
      if (!cycleId) throw Error("Abra a competência antes de definir o emissor.");
      if (issuerType === "outsourced" && !companyId) throw Error("Selecione a empresa terceirizada emissora.");
      const { error } = await (supabase.from("billing_v2_cycles" as any) as any)
        .update({ issuer_type: issuerType, outsourced_company_id: issuerType === "outsourced" ? companyId : null })
        .eq("id", cycleId);
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["billing-v2-cycles", clientId] }); toast.success("Emissor do demonstrativo salvo."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const addCycleService = useMutation({
    mutationFn: async () => {
      if (!cycleId || !selectedServiceId) throw Error("Selecione o serviço para incluir no boletim.");
      const issuerCompanyId = cycle?.issuer_type === "outsourced" ? cycle.outsourced_company_id : null;
      const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any).insert({
        cycle_id: cycleId,
        waste_service_id: selectedServiceId,
        outsourced_company_id: issuerCompanyId,
        amount: Number(serviceAmount || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => { setSelectedServiceId(""); setServiceAmount("0"); refresh(); toast.success("Serviço incluído no boletim."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateCycleServiceAmount = async (id: string, amount: string) => {
    const { error } = await (supabase.from("billing_v2_cycle_services" as any) as any)
      .update({ amount: Number(amount || 0) })
      .eq("id", id);
    if (error) toast.error(error.message); else refresh();
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
    const servicesTotal = cycleServices.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { rental, exchanges, weight, exchange, treatment, services: servicesTotal, total: rental + exchange + treatment + servicesTotal };
  }, [placements, movements, cycleServices, fixedRates.exchange_rate, fixedRates.treatment_rate]);
  const clientName = clients.find((item) => item.id === clientId)?.name || "Cliente";
  const branch = (id: string) => branches.find((item) => item.id === id);
  const openCycles = (cyclesQuery.data || []).filter((item) => item.status === "draft");
  const issuerCompany = outsourcedCompanies.find((company) => company.id === cycle?.outsourced_company_id);
  const documentThirdParty = issuerCompany || outsourcedCompanies.find((company) =>
    cycleServices.some((service) => service.outsourced_company_id === company.id),
  );
  const availableServices = services.filter((service) => {
    if (cycle?.issuer_type !== "outsourced" || !cycle.outsourced_company_id) return true;
    return outsourcedCompanyServices.some((link) => link.waste_service_id === service.id && link.outsourced_company_id === cycle.outsourced_company_id);
  }).filter((service) => !cycleServices.some((item) => item.waste_service_id === service.id));
  const generatePdf = async () => {
    const branchIds = Array.from(new Set([...placements, ...movements].map((item) => item.branch_id)));
    if (!cycle || !branchIds.length) {
      toast.error("Registre uma locação ou movimentação antes de gerar o PDF.");
      return;
    }
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const jacoby = companyProfile || { legal_name: "JACOBY SOLUÇÕES AMBIENTAIS", trade_name: "Jacoby Soluções Ambientais", cnpj: null, address: null, postal_code: null, phone: null, email: null, environmental_license: null, logo_url: null };
    const issuerName = cycle.issuer_type === "outsourced" && issuerCompany
      ? issuerCompany.trade_name || issuerCompany.legal_name
      : jacoby.trade_name || jacoby.legal_name;
    const companyDetails = (company: { cnpj?: string | null; address?: string | null; postal_code?: string | null; phone?: string | null; environmental_license?: string | null }) =>
      [company.cnpj && `CNPJ: ${company.cnpj}`, company.address, company.postal_code && `CEP: ${company.postal_code}`, company.phone && `Fone: ${company.phone}`, company.environmental_license && `Licença: ${company.environmental_license}`].filter(Boolean).join(" · ");
    const drawLogo = async (url: string | null | undefined, x: number, y: number, w: number, h: number, fallback = false) => {
      try {
        if (url) doc.addImage(await logoAsDataUrl(url), "PNG", x, y, w, h);
        else if (fallback) { const image = new Image(); image.src = jacobyLogo; await image.decode(); doc.addImage(image, "PNG", x, y, w, h); }
      } catch {}
    };
    const drawHeader = async (pageBranch: Branch, pageIndex: number) => {
      if (pageIndex) doc.addPage();
      doc.setFillColor(62, 122, 79); doc.rect(0, 0, 210, 46, "F");
      doc.setFillColor(250, 253, 249); doc.roundedRect(12, 6, 40, 28, 3, 3, "F");
      doc.setDrawColor(210, 229, 205); doc.setLineWidth(0.35); doc.roundedRect(12, 6, 40, 28, 3, 3, "S");
      await drawLogo(jacoby.logo_url, 15, 9, 34, 21, true);
      if (documentThirdParty?.logo_url) {
        doc.setFillColor(250, 253, 249); doc.roundedRect(158, 6, 40, 28, 3, 3, "F");
        doc.setDrawColor(210, 229, 205); doc.roundedRect(158, 6, 40, 28, 3, 3, "S");
        await drawLogo(documentThirdParty.logo_url, 161, 9, 34, 21);
      }
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("BOLETIM DE MEDIÇÃO", 105, 16, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text(`Período: ${new Date(`${cycle.period_start}T12:00:00`).toLocaleDateString("pt-BR")} a ${new Date(`${cycle.period_end}T12:00:00`).toLocaleDateString("pt-BR")}`, 105, 23, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(clientName.toUpperCase(), 105, 34, { align: "center" });
      doc.setFillColor(236, 246, 228); doc.roundedRect(14, 51, 182, 11, 2, 2, "F");
      doc.setTextColor(35, 96, 58); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
      doc.text(`NOTA FISCAL SERÁ EMITIDA PELA ${cycle.issuer_type === "outsourced" ? `TERCEIRIZADA ${issuerName.toUpperCase()}` : "JACOBY SOLUÇÕES AMBIENTAIS"}`, 105, 58, { align: "center" });
      const companyY = 69;
      const drawCompanyCard = (x: number, role: string, name: string, details: string) => {
        doc.setFillColor(247, 250, 246); doc.roundedRect(x, companyY, 88, 34, 3, 3, "F"); doc.setDrawColor(184, 210, 176); doc.roundedRect(x, companyY, 88, 34, 3, 3, "S");
        doc.setTextColor(35, 96, 58); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.text(role.toUpperCase(), x + 5, companyY + 7);
        doc.setTextColor(39, 61, 45); doc.setFontSize(9); doc.text(doc.splitTextToSize(name, 76)[0], x + 5, companyY + 13);
        doc.setTextColor(93, 112, 97); doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.text(doc.splitTextToSize(details || "Dados cadastrais não informados.", 76).slice(0, 3), x + 5, companyY + 19);
      };
      drawCompanyCard(14, "Jacoby Soluções Ambientais - Gerenciadora", jacoby.trade_name || jacoby.legal_name, companyDetails(jacoby));
      drawCompanyCard(108, "Terceirizada - Executora / Transportadora", documentThirdParty?.trade_name || documentThirdParty?.legal_name || "Não informada", companyDetails(documentThirdParty || {}));
      let y = 110;
      doc.setFillColor(244, 248, 242); doc.roundedRect(14, y, 182, 26, 3, 3, "F"); doc.setDrawColor(184, 210, 176); doc.roundedRect(14, y, 182, 26, 3, 3, "S");
      doc.setTextColor(39, 61, 45); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(`Empresa geradora / unidade: ${pageBranch.name}`, 20, y + 8);
      const details = [pageBranch.cnpj && `CNPJ: ${pageBranch.cnpj}`, pageBranch.address].filter(Boolean).join(" · ");
      doc.setTextColor(93, 112, 97); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(doc.splitTextToSize(details || "Dados cadastrais não informados.", 168), 20, y + 15);
      return y + 34;
    };
    for (const [index, id] of branchIds.entries()) {
      const pageBranch = branch(id);
      if (!pageBranch) continue;
      let y = await drawHeader(pageBranch, index);
      const branchPlacements = placements.filter((item) => item.branch_id === id);
      const branchMoves = movements.filter((item) => item.branch_id === id);
      const treatmentByResidue = branchMoves.reduce<Record<string, number>>((acc, item) => {
        const key = item.waste_residue_id || "sem-residuo";
        acc[key] = (acc[key] || 0) + Number(item.weight_kg || 0);
        return acc;
      }, {});
      const items = [
        ...branchPlacements.map((item) => ({
          name: `Locação · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id))}`,
          type: "Equipamento",
          quantity: `${number(Number(item.quantity))} un.`,
          value: Number(item.quantity) * Number(item.monthly_rental_rate || 0),
        })),
        ...branchMoves.filter((item) => Number(item.removed_quantity || 0) > 0).map((item) => ({
          name: `Troca · ${equipmentName(equipment.find((entry) => entry.id === item.equipment_id || ""))}`,
          type: item.replacement_equipment_id ? `Entrada: ${equipmentName(equipment.find((entry) => entry.id === item.replacement_equipment_id || ""))}` : "Troca",
          quantity: `${number(Number(item.removed_quantity))} un.`,
          value: Number(item.removed_quantity || 0) * fixedRates.exchange_rate,
        })),
        ...Object.entries(treatmentByResidue).filter(([, weight]) => weight > 0).map(([residueId, weight]) => ({
          name: residues.find((entry) => entry.id === residueId)?.name || "Tratamento de resíduos",
          type: "Resíduo",
          quantity: `${number(weight)} kg`,
          value: weight * fixedRates.treatment_rate,
        })),
        ...(index === 0
          ? cycleServices.map((item) => ({
              name: services.find((entry) => entry.id === item.waste_service_id)?.name || "Serviço",
              type: "Serviço terceirizado",
              quantity: "Avulso",
              value: Number(item.amount || 0),
            }))
          : []),
      ];
      doc.setFillColor(35, 96, 58);
      doc.roundedRect(14, y, 182, 9, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("ITEM", 20, y + 6);
      doc.text("TIPO", 104, y + 6);
      doc.text("QUANTIDADE", 139, y + 6);
      doc.text("VALOR", 190, y + 6, { align: "right" });
      y += 9;
      items.forEach((item, itemIndex) => {
        if (itemIndex % 2 === 0) {
          doc.setFillColor(247, 250, 246);
          doc.rect(14, y, 182, 10, "F");
        }
        doc.setTextColor(39, 61, 45);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.text(doc.splitTextToSize(item.name, 78)[0], 20, y + 6.5);
        doc.setTextColor(93, 112, 97);
        doc.text(doc.splitTextToSize(item.type, 32)[0], 104, y + 6.5);
        doc.text(item.quantity, 139, y + 6.5);
        doc.setTextColor(39, 61, 45);
        doc.text(money(item.value), 190, y + 6.5, { align: "right" });
        y += 10;
      });
      const branchTotal = items.reduce((sum, item) => sum + item.value, 0);
      y += 8;
      doc.setFillColor(232, 244, 226);
      doc.roundedRect(118, y, 78, 18, 3, 3, "F");
      doc.setTextColor(35, 96, 58);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("TOTAL DO DEMONSTRATIVO", 124, y + 7);
      doc.setFontSize(14);
      doc.text(money(branchTotal), 190, y + 14, { align: "right" });
      doc.setDrawColor(153, 190, 125);
      doc.setLineWidth(0.35);
      doc.line(14, 274, 196, 274);
      doc.setTextColor(93, 112, 97);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Jacoby Soluções Ambientais · Gestão responsável de resíduos", 20, 283);
      doc.text("Soluções que respeitam o meio ambiente.", 196, 283, { align: "right" });
    }
    doc.save(`demonstrativo-${clientName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${cycle.period_start}.pdf`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Portal do Cliente</p>
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Novo fluxo mensal baseado no boletim: locação, troca e tratamento por kg.
        </p>
      </header>
      <Card className="grid gap-3 p-4 md:grid-cols-4">
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
        <Field label="Competências abertas">
          <Select
            value={cycleId || "new"}
            onValueChange={(value) => {
              if (value === "new") {
                setCycleId("");
                return;
              }
              const selectedCycle = openCycles.find((item) => item.id === value);
              if (!selectedCycle) return;
              setCycleId(selectedCycle.id);
              setMonth(selectedCycle.period_start.slice(0, 7));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar competência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Nova competência</SelectItem>
              {openCycles.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
                    new Date(`${item.period_start}T12:00:00`),
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Button variant="outline" className="self-end" onClick={() => void generatePdf()}>
              <Download className="mr-2 h-4 w-4" />
              Gerar PDF
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
                <h2 className="font-semibold">Emissão e serviços terceirizados</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha quem emite o demonstrativo. Quando a terceirizada for a emissora, o PDF
                  traz o logo dela junto ao logo da Jacoby e lista somente os serviços vinculados a ela.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Field label="Emitido por">
                    <Select
                      value={cycle?.issuer_type || "jacoby"}
                      onValueChange={(value) => {
                        const issuerType = value as "jacoby" | "outsourced";
                        if (issuerType === "jacoby") {
                          saveIssuer.mutate({ issuerType, companyId: "" });
                          return;
                        }
                        const firstCompanyId = outsourcedCompanies[0]?.id;
                        if (!firstCompanyId) {
                          toast.error("Cadastre uma empresa terceirizada antes de selecioná-la como emissora.");
                          return;
                        }
                        saveIssuer.mutate({ issuerType, companyId: firstCompanyId });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jacoby">Jacoby Soluções Ambientais</SelectItem>
                        <SelectItem value="outsourced">Empresa terceirizada</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {cycle?.issuer_type === "outsourced" && (
                    <Field label="Empresa emissora">
                      <Select
                        value={cycle.outsourced_company_id || ""}
                        onValueChange={(companyId) => saveIssuer.mutate({ issuerType: "outsourced", companyId })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecionar terceirizada" /></SelectTrigger>
                        <SelectContent>
                          {outsourcedCompanies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>{company.trade_name || company.legal_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm md:col-span-2">
                    <p className="text-xs font-medium uppercase text-primary">Destaque no documento</p>
                    <p className="mt-1 font-semibold">Emitido por {cycle?.issuer_type === "outsourced" ? issuerCompany?.trade_name || issuerCompany?.legal_name || "empresa terceirizada" : "Jacoby Soluções Ambientais"}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-[1fr_180px_auto]">
                  <Field label="Incluir serviço no boletim">
                    <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                      <SelectTrigger><SelectValue placeholder={cycle?.issuer_type === "outsourced" && !issuerCompany ? "Selecione a empresa emissora primeiro" : "Selecionar serviço"} /></SelectTrigger>
                      <SelectContent>
                        {availableServices.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Valor aplicado">
                    <Input type="number" min="0" step="0.01" value={serviceAmount} onChange={(event) => setServiceAmount(event.target.value)} />
                  </Field>
                  <Button className="self-end" onClick={() => addCycleService.mutate()} disabled={!selectedServiceId}>Incluir serviço</Button>
                </div>
                {cycleServices.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Serviço</th><th className="p-2">Executora</th><th className="p-2">Valor</th><th className="p-2" /></tr></thead><tbody>{cycleServices.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{services.find((service) => service.id === item.waste_service_id)?.name || "Serviço"}</td><td className="p-2">{outsourcedCompanies.find((company) => company.id === item.outsourced_company_id)?.trade_name || outsourcedCompanies.find((company) => company.id === item.outsourced_company_id)?.legal_name || "—"}</td><td className="p-2"><Input className="h-8 w-32" type="number" min="0" step="0.01" defaultValue={Number(item.amount || 0)} onBlur={(event) => void updateCycleServiceAmount(item.id, event.target.value)} /></td><td className="p-2"><Button variant="ghost" size="icon" onClick={() => void remove("billing_v2_cycle_services", item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>)}</tbody></table></div>}
              </Card>
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
                services={services}
                cycleServices={cycleServices}
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
  services,
  cycleServices,
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
  services: Service[];
  cycleServices: CycleService[];
  totals: {
    rental: number;
    exchanges: number;
    weight: number;
    exchange: number;
    treatment: number;
    services: number;
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
          {cycleServices.map((item) => (
            <tr key={item.id} className="border-b">
              <td className="py-2">{services.find((service) => service.id === item.waste_service_id)?.name || "Serviço terceirizado"}</td>
              <td className="py-2">Avulso</td>
              <td className="py-2">Conforme boletim</td>
              <td className="py-2 text-right">{money(Number(item.amount || 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-full max-w-xs rounded-lg bg-primary/10 p-4 text-right">
        <p className="text-xs font-medium uppercase text-primary">Faturamento total</p>
        <p className="mt-1 text-2xl font-bold text-primary">{money(totals.total)}</p>
      </div>
    </Card>
  );
}
