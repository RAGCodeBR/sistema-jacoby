-- O preço da troca pertence ao equipamento que sai, e não mais ao cliente inteiro.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 0
  CHECK (exchange_rate >= 0);

ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 0
  CHECK (exchange_rate >= 0);

-- Mantém a regra acordada para a base existente: os equipamentos do Pátio 2
-- recebem o valor que antes era único para o cliente. Os demais começam em zero.
UPDATE public.waste_equipment AS equipment
SET exchange_rate = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.client_branches AS branch
  WHERE branch.id = equipment.branch_id
    AND lower(trim(branch.name)) = 'pátio 2'
);

UPDATE public.waste_equipment AS equipment
SET exchange_rate = COALESCE(settings.exchange_rate, 0)
FROM public.client_branches AS branch
LEFT JOIN public.waste_client_billing_settings AS settings
  ON settings.client_id = branch.client_id
WHERE equipment.branch_id = branch.id
  AND lower(trim(branch.name)) = 'pátio 2';

-- Boletins já lançados mantêm o valor de troca que estava configurado antes.
UPDATE public.billing_v2_movements AS movement
SET exchange_rate = COALESCE(settings.exchange_rate, 0)
FROM public.billing_v2_cycles AS cycle
LEFT JOIN public.waste_client_billing_settings AS settings
  ON settings.client_id = cycle.client_id
WHERE movement.cycle_id = cycle.id
  AND movement.exchange_rate = 0
  AND COALESCE(movement.removed_quantity, 0) > 0;

NOTIFY pgrst, 'reload schema';
