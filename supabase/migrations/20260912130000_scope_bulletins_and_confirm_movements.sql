-- Cada boletim novo pertence a uma única filial/pátio. Os boletins antigos
-- continuam legíveis (branch_id nulo), sem misturar o histórico já emitido.
ALTER TABLE public.billing_v2_cycles
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS billing_v2_cycles_client_branch_idx
  ON public.billing_v2_cycles (client_id, branch_id, created_at DESC);

-- O resíduo pode ter preço próprio por cliente e filial/pátio.
ALTER TABLE public.waste_residues
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE SET NULL;

ALTER TABLE public.waste_residues
  DROP CONSTRAINT IF EXISTS waste_residues_client_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS waste_residues_client_branch_name_key
  ON public.waste_residues (client_id, branch_id, name);

-- Movimentação planejada fica registrada, mas só afeta locação, troca,
-- tratamento e PDF quando confirmada como realizada.
ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS treatment_rate NUMERIC NOT NULL DEFAULT 0 CHECK (treatment_rate >= 0);

-- Tudo que já existia foi efetivamente lançado antes desta regra.
UPDATE public.billing_v2_movements
SET confirmed = true
WHERE confirmed = false;

UPDATE public.billing_v2_movements AS movement
SET treatment_rate = COALESCE(residue.default_treatment_rate, 0)
FROM public.waste_residues AS residue
WHERE residue.id = movement.waste_residue_id
  AND movement.treatment_rate = 0;

CREATE INDEX IF NOT EXISTS billing_v2_movements_confirmed_idx
  ON public.billing_v2_movements (cycle_id, branch_id, confirmed, occurred_on);

CREATE POLICY billing_v2_cycles_movement_settings_read ON public.billing_v2_cycles FOR SELECT TO authenticated
  USING (public.has_app_permission('movement_settings'));

NOTIFY pgrst, 'reload schema';
