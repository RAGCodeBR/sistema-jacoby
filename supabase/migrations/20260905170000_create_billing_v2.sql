-- Faturamento 2: fluxo independente do faturamento legado, inspirado no
-- boletim operacional (locação + troca + tratamento por peso).
CREATE TABLE IF NOT EXISTS public.billing_v2_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, period_start),
  CHECK (period_end >= period_start)
);

-- Uma colocação persiste entre competências. Assim a locação continua sendo
-- cobrada mesmo quando o mês não tiver nenhuma movimentação.
CREATE TABLE IF NOT EXISTS public.billing_v2_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.client_branches(id) ON DELETE RESTRICT,
  equipment_id UUID NOT NULL REFERENCES public.waste_equipment(id) ON DELETE RESTRICT,
  waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE SET NULL,
  started_on DATE NOT NULL,
  ended_on DATE,
  quantity NUMERIC NOT NULL DEFAULT 1 CHECK (quantity > 0),
  monthly_rental_rate NUMERIC NOT NULL DEFAULT 0 CHECK (monthly_rental_rate >= 0),
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE TABLE IF NOT EXISTS public.billing_v2_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.client_branches(id) ON DELETE RESTRICT,
  equipment_id UUID REFERENCES public.waste_equipment(id) ON DELETE SET NULL,
  waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE SET NULL,
  occurred_on DATE NOT NULL,
  service_order TEXT,
  placed_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (placed_quantity >= 0),
  removed_quantity NUMERIC NOT NULL DEFAULT 0 CHECK (removed_quantity >= 0),
  weight_kg NUMERIC NOT NULL DEFAULT 0 CHECK (weight_kg >= 0),
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_v2_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL UNIQUE REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  exchange_rate NUMERIC NOT NULL DEFAULT 0 CHECK (exchange_rate >= 0),
  treatment_rate NUMERIC NOT NULL DEFAULT 0 CHECK (treatment_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_v2_placements_active_idx ON public.billing_v2_placements (client_id, branch_id, started_on, ended_on);
CREATE INDEX IF NOT EXISTS billing_v2_movements_cycle_idx ON public.billing_v2_movements (cycle_id, branch_id, occurred_on);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_v2_cycles, public.billing_v2_placements, public.billing_v2_movements, public.billing_v2_rates TO authenticated;
ALTER TABLE public.billing_v2_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_v2_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_v2_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_v2_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_v2_cycles_admin_manage ON public.billing_v2_cycles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY billing_v2_placements_admin_manage ON public.billing_v2_placements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY billing_v2_movements_admin_manage ON public.billing_v2_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY billing_v2_rates_admin_manage ON public.billing_v2_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.jacoby_billing_v2_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER billing_v2_cycles_updated_at BEFORE UPDATE ON public.billing_v2_cycles FOR EACH ROW EXECUTE FUNCTION public.jacoby_billing_v2_updated_at();
CREATE TRIGGER billing_v2_rates_updated_at BEFORE UPDATE ON public.billing_v2_rates FOR EACH ROW EXECUTE FUNCTION public.jacoby_billing_v2_updated_at();

NOTIFY pgrst, 'reload schema';
