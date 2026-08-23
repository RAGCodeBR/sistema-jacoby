-- Cadastros reutilizáveis por cliente para a Gestão de Resíduos.
-- O demonstrativo mensal apenas referencia estes itens: não duplica o cadastro.
CREATE TABLE IF NOT EXISTS public.waste_residues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  waste_class TEXT NOT NULL DEFAULT 'class_ii' CHECK (waste_class IN ('class_i', 'class_ii')),
  unit TEXT NOT NULL DEFAULT 'kg',
  default_rental_rate NUMERIC NOT NULL DEFAULT 0,
  default_exchange_rate NUMERIC NOT NULL DEFAULT 0,
  default_treatment_rate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS public.waste_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  equipment_type TEXT NOT NULL,
  load_capacity_kg NUMERIC,
  plate TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mantém compatibilidade com relatórios antigos e permite que os novos usem o
-- cadastro de resíduos/equipamentos do cliente.
ALTER TABLE public.waste_movements ADD COLUMN IF NOT EXISTS waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE RESTRICT;
ALTER TABLE public.waste_billing_rates ADD COLUMN IF NOT EXISTS waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE CASCADE;
ALTER TABLE public.waste_weighing_tickets ADD COLUMN IF NOT EXISTS waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE RESTRICT;
ALTER TABLE public.waste_weighing_tickets ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES public.waste_equipment(id) ON DELETE SET NULL;

ALTER TABLE public.waste_movements ALTER COLUMN waste_category DROP NOT NULL;
ALTER TABLE public.waste_billing_rates ALTER COLUMN waste_category DROP NOT NULL;
ALTER TABLE public.waste_weighing_tickets ALTER COLUMN waste_category DROP NOT NULL;
ALTER TABLE public.waste_movements DROP CONSTRAINT IF EXISTS waste_movements_waste_category_check;
ALTER TABLE public.waste_billing_rates DROP CONSTRAINT IF EXISTS waste_billing_rates_waste_category_check;
ALTER TABLE public.waste_weighing_tickets DROP CONSTRAINT IF EXISTS waste_weighing_tickets_waste_category_check;
CREATE UNIQUE INDEX IF NOT EXISTS waste_rates_report_residue_idx ON public.waste_billing_rates (report_id, waste_residue_id) WHERE waste_residue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS waste_residues_client_idx ON public.waste_residues (client_id, active);
CREATE INDEX IF NOT EXISTS waste_equipment_client_idx ON public.waste_equipment (client_id, active);

CREATE OR REPLACE FUNCTION public.jacoby_waste_catalog_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS jacoby_waste_residues_updated_at ON public.waste_residues;
CREATE TRIGGER jacoby_waste_residues_updated_at BEFORE UPDATE ON public.waste_residues FOR EACH ROW EXECUTE FUNCTION public.jacoby_waste_catalog_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_residues, public.waste_equipment TO authenticated;
ALTER TABLE public.waste_residues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waste_residues_admin_manage ON public.waste_residues;
CREATE POLICY waste_residues_admin_manage ON public.waste_residues FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_residues_client_read ON public.waste_residues;
CREATE POLICY waste_residues_client_read ON public.waste_residues FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.client_user_links l WHERE l.client_id = waste_residues.client_id AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS waste_equipment_admin_manage ON public.waste_equipment;
CREATE POLICY waste_equipment_admin_manage ON public.waste_equipment FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_equipment_client_read ON public.waste_equipment;
CREATE POLICY waste_equipment_client_read ON public.waste_equipment FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.client_user_links l WHERE l.client_id = waste_equipment.client_id AND l.user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
