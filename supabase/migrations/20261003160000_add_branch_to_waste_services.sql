-- Scope client services by filial/pátio (matriz = null), like equipment and residues.
-- Existing services keep their data and become matriz (branch_id null). New services can
-- be registered for the matriz or for a specific filial; a bulletin shows only the
-- services of its own context. Outsourced-company catalog services stay branch-agnostic.
-- Nullable + ON DELETE SET NULL so removing a filial never deletes its services.

ALTER TABLE public.waste_services
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE SET NULL;
