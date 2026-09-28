-- Um serviço aparece uma vez por boletim, com quantidade e observação próprias.
-- O valor armazenado continua sendo o total do lançamento para manter o Financeiro inalterado.
ALTER TABLE public.billing_v2_cycle_services
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  ADD COLUMN IF NOT EXISTS observation TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS billing_v2_cycle_services_unique_service_per_cycle_idx
  ON public.billing_v2_cycle_services (
    cycle_id,
    waste_service_id,
    COALESCE(outsourced_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
