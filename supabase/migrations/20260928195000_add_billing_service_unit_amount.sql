-- O valor do serviço é unitário; `amount` mantém o total do lançamento para
-- que o BM e o Financeiro usem a quantidade corretamente.
ALTER TABLE public.billing_v2_cycle_services
  ADD COLUMN IF NOT EXISTS unit_amount NUMERIC(14,2);

UPDATE public.billing_v2_cycle_services
SET unit_amount = amount / GREATEST(quantity, 1)
WHERE unit_amount IS NULL;

ALTER TABLE public.billing_v2_cycle_services
  ALTER COLUMN unit_amount SET DEFAULT 0,
  ALTER COLUMN unit_amount SET NOT NULL;

ALTER TABLE public.billing_v2_cycle_services
  DROP CONSTRAINT IF EXISTS billing_v2_cycle_services_unit_amount_nonnegative,
  ADD CONSTRAINT billing_v2_cycle_services_unit_amount_nonnegative CHECK (unit_amount >= 0);
