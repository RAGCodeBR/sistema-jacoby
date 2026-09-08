-- Colocações de caçamba são lançamentos financeiros independentes.
-- Elas não fazem parte do peso, das remoções ou do MTR das movimentações usuais.
ALTER TABLE public.waste_movements
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'movement',
  ADD COLUMN IF NOT EXISTS placement_value NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.waste_movements
  DROP CONSTRAINT IF EXISTS waste_movements_operation_type_check;

ALTER TABLE public.waste_movements
  ADD CONSTRAINT waste_movements_operation_type_check
  CHECK (operation_type IN ('movement', 'container_placement'));

CREATE INDEX IF NOT EXISTS waste_movements_operation_type_idx
  ON public.waste_movements (report_id, operation_type, branch_id);
