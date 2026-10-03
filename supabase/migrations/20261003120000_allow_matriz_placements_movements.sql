-- Allow matriz (no filial/pátio) bulletins to carry placements and movements.
-- billing_v2_cycles.branch_id, waste_equipment.branch_id and waste_residues.branch_id
-- are already nullable, but billing_v2_placements.branch_id and
-- billing_v2_movements.branch_id were created NOT NULL, which blocks registering
-- locação/movimentação for a client's matriz when the client also has branches.
-- Relax the constraint so branch_id can be null (= matriz). FK and ON DELETE rules stay.

ALTER TABLE public.billing_v2_placements ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE public.billing_v2_movements ALTER COLUMN branch_id DROP NOT NULL;
