-- Dados institucionais usados nos boletins e demonstrativos emitidos pela Jacoby.
CREATE TABLE IF NOT EXISTS public.company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  cnpj TEXT,
  address TEXT,
  postal_code TEXT,
  phone TEXT,
  email TEXT,
  environmental_license TEXT,
  logo_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_profiles TO authenticated;
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_profiles_authenticated_read ON public.company_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY company_profiles_admin_manage ON public.company_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.jacoby_company_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER company_profiles_updated_at BEFORE UPDATE ON public.company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_company_profiles_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-profile-logos', 'company-profile-logos', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
CREATE POLICY company_profile_logos_admin_manage ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'company-profile-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'company-profile-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

NOTIFY pgrst, 'reload schema';
