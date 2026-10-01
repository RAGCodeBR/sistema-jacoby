-- Valores de serviço específicos por cliente, terceirizada e filial/pátio.
-- A ausência de empresa e filial representa a regra geral do cliente.
CREATE TABLE IF NOT EXISTS public.waste_client_service_rate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  waste_service_id uuid NOT NULL REFERENCES public.waste_services(id) ON DELETE CASCADE,
  outsourced_company_id uuid REFERENCES public.outsourced_companies(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.client_branches(id) ON DELETE CASCADE,
  default_rate numeric(14,2) NOT NULL DEFAULT 0 CHECK (default_rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waste_client_service_rate_override_scope_key
  ON public.waste_client_service_rate_overrides (
    client_id,
    waste_service_id,
    COALESCE(outsourced_company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS waste_client_service_rate_overrides_client_id_idx
  ON public.waste_client_service_rate_overrides (client_id, waste_service_id);

ALTER TABLE public.waste_client_service_rate_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_rate_overrides_billing_read"
  ON public.waste_client_service_rate_overrides FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));

CREATE POLICY "service_rate_overrides_movement_settings_manage"
  ON public.waste_client_service_rate_overrides FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));

CREATE OR REPLACE FUNCTION public.touch_waste_client_service_rate_override()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_waste_client_service_rate_override
  BEFORE UPDATE ON public.waste_client_service_rate_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_waste_client_service_rate_override();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_client_service_rate_overrides TO authenticated;

NOTIFY pgrst, 'reload schema';
