-- Um resíduo pode sair de um demonstrativo mensal sem apagar o cadastro-base
-- utilizado em relatórios futuros do mesmo cliente.
ALTER TABLE public.waste_billing_rates
  ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
