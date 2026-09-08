-- Valores comerciais permanentes: locação por equipamento e troca/tratamento por cliente.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS monthly_rental_rate NUMERIC NOT NULL DEFAULT 0 CHECK (monthly_rental_rate >= 0);

CREATE TABLE IF NOT EXISTS public.waste_client_billing_settings (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  exchange_rate NUMERIC NOT NULL DEFAULT 0 CHECK (exchange_rate >= 0),
  treatment_rate NUMERIC NOT NULL DEFAULT 0 CHECK (treatment_rate >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS replacement_equipment_id UUID REFERENCES public.waste_equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS billing_v2_movements_replacement_equipment_idx
  ON public.billing_v2_movements (replacement_equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_client_billing_settings TO authenticated;
ALTER TABLE public.waste_client_billing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY waste_client_billing_settings_admin_manage ON public.waste_client_billing_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.jacoby_client_billing_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER waste_client_billing_settings_updated_at BEFORE UPDATE ON public.waste_client_billing_settings FOR EACH ROW EXECUTE FUNCTION public.jacoby_client_billing_settings_updated_at();

NOTIFY pgrst, 'reload schema';
