-- Clean, independent Client Portal for the Jacoby workspace.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client';

CREATE TABLE IF NOT EXISTS public.client_user_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_user_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_user_links TO authenticated;
DROP POLICY IF EXISTS jacoby_client_user_links_authenticated ON public.client_user_links;
CREATE POLICY jacoby_client_user_links_authenticated ON public.client_user_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.client_user_links WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE TABLE IF NOT EXISTS public.client_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_files ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_files TO authenticated;
DROP POLICY IF EXISTS jacoby_client_files_authenticated ON public.client_files;
CREATE POLICY jacoby_client_files_authenticated ON public.client_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.client_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid')),
  paid_at timestamptz,
  payment_method text NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'boleto', 'link')),
  payment_link text,
  pix_key text,
  boleto_file_name text,
  boleto_storage_path text,
  boleto_mime_type text,
  invoice_file_name text,
  invoice_storage_path text,
  invoice_mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoices TO authenticated;
DROP POLICY IF EXISTS jacoby_client_invoices_authenticated ON public.client_invoices;
CREATE POLICY jacoby_client_invoices_authenticated ON public.client_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS jacoby_client_invoices_updated_at ON public.client_invoices;
CREATE TRIGGER jacoby_client_invoices_updated_at BEFORE UPDATE ON public.client_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-documents', 'invoice-documents', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS jacoby_portal_storage_authenticated ON storage.objects;
CREATE POLICY jacoby_portal_storage_authenticated ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('invoice-documents', 'task-attachments'))
  WITH CHECK (bucket_id IN ('invoice-documents', 'task-attachments'));

NOTIFY pgrst, 'reload schema';
