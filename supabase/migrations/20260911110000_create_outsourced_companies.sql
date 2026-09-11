-- Empresas PJ terceirizadas responsáveis por tratamento, transporte ou destinação.
CREATE TABLE IF NOT EXISTS public.outsourced_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT UNIQUE,
  service_description TEXT,
  environmental_license TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  responsible TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outsourced_companies_name_idx ON public.outsourced_companies (legal_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outsourced_companies TO authenticated;
ALTER TABLE public.outsourced_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY outsourced_companies_admin_manage ON public.outsourced_companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.jacoby_outsourced_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER outsourced_companies_updated_at BEFORE UPDATE ON public.outsourced_companies
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_companies_updated_at();

NOTIFY pgrst, 'reload schema';
