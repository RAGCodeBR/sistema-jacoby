-- Cada equipamento pertence a um pátio/filial do cliente. Isso impede que uma
-- troca ofereça equipamento cadastrado em outra unidade.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS waste_equipment_client_branch_idx
  ON public.waste_equipment (client_id, branch_id, active);

-- Migração dos equipamentos já cadastrados para a Transtec, conforme definido
-- para o fluxo atual: todos pertencem ao Pátio 2.
UPDATE public.waste_equipment AS equipment
SET branch_id = branch.id
FROM public.clients AS client
JOIN public.client_branches AS branch ON branch.client_id = client.id
WHERE equipment.client_id = client.id
  AND equipment.branch_id IS NULL
  AND lower(client.name) = lower('Transtec')
  AND lower(branch.name) = lower('Pátio 2');

NOTIFY pgrst, 'reload schema';
