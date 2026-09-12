-- Each equipment can keep the residue normally handled during an exchange.
-- Historical movements retain their own residue snapshots and are not changed.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS default_waste_residue_id UUID
  REFERENCES public.waste_residues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS waste_equipment_default_waste_residue_id_idx
  ON public.waste_equipment (default_waste_residue_id);

NOTIFY pgrst, 'reload schema';
