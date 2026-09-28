-- Um mesmo serviço pode ocorrer mais de uma vez no mesmo boletim, inclusive
-- com valores, execução, faturamento e pagamento distintos.
ALTER TABLE public.billing_v2_cycle_services
  DROP CONSTRAINT IF EXISTS billing_v2_cycle_services_cycle_id_waste_service_id_outsourced_company_id_key;
