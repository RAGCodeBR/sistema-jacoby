-- Matriz e filiais/pátios de cada cliente. Uma filial não cria um novo login:
-- ela pertence à empresa-matriz e é visível para todos os usuários vinculados a ela.
CREATE TABLE IF NOT EXISTS public.client_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  cnpj TEXT,
  address TEXT,
  responsible TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_branches_client_cnpj_key UNIQUE (client_id, cnpj)
);

CREATE INDEX IF NOT EXISTS client_branches_client_idx ON public.client_branches(client_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_branches TO authenticated;
ALTER TABLE public.client_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jacoby_client_branches_admin_manage ON public.client_branches;
CREATE POLICY jacoby_client_branches_admin_manage ON public.client_branches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS jacoby_client_branches_client_read ON public.client_branches;
CREATE POLICY jacoby_client_branches_client_read ON public.client_branches
  FOR SELECT TO authenticated
  USING (is_active AND EXISTS (
    SELECT 1 FROM public.client_user_links link
    WHERE link.client_id = client_branches.client_id AND link.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.jacoby_client_branches_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS jacoby_client_branches_updated_at ON public.client_branches;
CREATE TRIGGER jacoby_client_branches_updated_at
  BEFORE UPDATE ON public.client_branches
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_client_branches_updated_at();

NOTIFY pgrst, 'reload schema';
