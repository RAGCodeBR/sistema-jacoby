-- A locação passa a pertencer ao equipamento do cliente e do pátio, e não
-- mais a um valor geral do cliente. A coluna já existe desde a primeira versão
-- do Faturamento 2; esta migração somente transfere o valor que estava em uso.

-- Todos os equipamentos fora do Pátio 2 começam sem valor definido (R$ 0,00).
UPDATE public.waste_equipment AS equipment
SET monthly_rental_rate = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.client_branches AS branch
  WHERE branch.id = equipment.branch_id
    AND lower(trim(branch.name)) = 'pátio 2'
);

-- O valor geral que já era usado pela Transtec no Pátio 2 torna-se o valor de
-- cada equipamento cadastrado nesse pátio, preservando a cobrança atual.
UPDATE public.waste_equipment AS equipment
SET monthly_rental_rate = COALESCE(settings.rental_rate, 0)
FROM public.client_branches AS branch
LEFT JOIN public.waste_client_billing_settings AS settings
  ON settings.client_id = branch.client_id
WHERE equipment.branch_id = branch.id
  AND lower(trim(branch.name)) = 'pátio 2';

NOTIFY pgrst, 'reload schema';
