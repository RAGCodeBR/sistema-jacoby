-- Complementa o cadastro PJ e relaciona cada serviço cadastrado à sua executora.
ALTER TABLE public.outsourced_companies
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS public.outsourced_company_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outsourced_company_id UUID NOT NULL REFERENCES public.outsourced_companies(id) ON DELETE CASCADE,
  waste_service_id UUID NOT NULL REFERENCES public.waste_services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outsourced_company_id, waste_service_id)
);

CREATE INDEX IF NOT EXISTS outsourced_company_services_service_idx
  ON public.outsourced_company_services (waste_service_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outsourced_company_services TO authenticated;
ALTER TABLE public.outsourced_company_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY outsourced_company_services_admin_manage ON public.outsourced_company_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.billing_v2_cycles
  ADD COLUMN IF NOT EXISTS issuer_type TEXT NOT NULL DEFAULT 'jacoby'
    CHECK (issuer_type IN ('jacoby', 'outsourced')),
  ADD COLUMN IF NOT EXISTS outsourced_company_id UUID REFERENCES public.outsourced_companies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.billing_v2_cycle_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  waste_service_id UUID NOT NULL REFERENCES public.waste_services(id) ON DELETE RESTRICT,
  outsourced_company_id UUID REFERENCES public.outsourced_companies(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, waste_service_id, outsourced_company_id)
);

CREATE INDEX IF NOT EXISTS billing_v2_cycle_services_cycle_idx
  ON public.billing_v2_cycle_services (cycle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_v2_cycle_services TO authenticated;
ALTER TABLE public.billing_v2_cycle_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_v2_cycle_services_admin_manage ON public.billing_v2_cycle_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.jacoby_billing_v2_cycle_services_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER billing_v2_cycle_services_updated_at BEFORE UPDATE ON public.billing_v2_cycle_services
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_billing_v2_cycle_services_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('outsourced-company-logos', 'outsourced-company-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY outsourced_company_logos_admin_manage ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'outsourced-company-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'outsourced-company-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
