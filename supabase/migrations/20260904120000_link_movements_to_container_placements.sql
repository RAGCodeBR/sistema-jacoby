-- Uma movimentação/troca deve apontar para a ordem única de colocação que a originou.
ALTER TABLE public.waste_movements
  ADD COLUMN IF NOT EXISTS container_placement_id UUID
  REFERENCES public.waste_movements(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS waste_movements_container_placement_idx
  ON public.waste_movements (container_placement_id);
