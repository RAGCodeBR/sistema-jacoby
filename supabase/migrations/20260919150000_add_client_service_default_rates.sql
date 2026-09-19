-- Um mesmo serviço terceirizado pode ser usado por vários clientes, cada um
-- com seu próprio valor sugerido. O valor efetivamente cobrado continua sendo
-- gravado no boletim, para preservar o histórico de cada período.
CREATE TABLE IF NOT EXISTS public.waste_client_service_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  waste_service_id UUID NOT NULL REFERENCES public.waste_services(id) ON DELETE CASCADE,
  default_rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (default_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, waste_service_id)
);

CREATE INDEX IF NOT EXISTS waste_client_service_rates_client_idx
  ON public.waste_client_service_rates (client_id, waste_service_id);

INSERT INTO public.waste_client_service_rates (client_id, waste_service_id, default_rate)
SELECT client_id, id, default_rate
FROM public.waste_services
ON CONFLICT (client_id, waste_service_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_client_service_rates TO authenticated;
ALTER TABLE public.waste_client_service_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY waste_client_service_rates_billing_read
  ON public.waste_client_service_rates FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));

CREATE POLICY waste_client_service_rates_movement_settings_manage
  ON public.waste_client_service_rates FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
