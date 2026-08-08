-- Documentos controlados por cliente, com acesso restrito no Portal do Cliente.
CREATE TABLE IF NOT EXISTS public.client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  expires_at DATE,
  notify_days_before INTEGER NOT NULL DEFAULT 30 CHECK (notify_days_before >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  last_notified_on DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_documents_client_expiry_idx ON public.client_documents (client_id, expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jacoby_client_documents_admin_manage ON public.client_documents;
CREATE POLICY jacoby_client_documents_admin_manage ON public.client_documents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS jacoby_client_documents_client_read_current ON public.client_documents;
CREATE POLICY jacoby_client_documents_client_read_current ON public.client_documents
  FOR SELECT TO authenticated
  USING (
    active
    AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)
    AND EXISTS (
      SELECT 1 FROM public.client_user_links link
      WHERE link.client_id = client_documents.client_id AND link.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.jacoby_client_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS jacoby_client_documents_updated_at ON public.client_documents;
CREATE TRIGGER jacoby_client_documents_updated_at
  BEFORE UPDATE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_client_documents_updated_at();

INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS jacoby_client_documents_storage_admin_manage ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_admin_manage ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'client-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'client-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS jacoby_client_documents_storage_client_read ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_client_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND EXISTS (
      SELECT 1 FROM public.client_documents doc
      JOIN public.client_user_links link ON link.client_id = doc.client_id
      WHERE doc.storage_path = name
        AND doc.active
        AND (doc.expires_at IS NULL OR doc.expires_at >= CURRENT_DATE)
        AND link.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.jacoby_process_document_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN; END IF;
  FOR doc IN
    SELECT d.id, d.title, d.expires_at, c.name AS client_name
    FROM public.client_documents d
    JOIN public.clients c ON c.id = d.client_id
    WHERE d.active AND d.expires_at IS NOT NULL
      AND d.expires_at >= CURRENT_DATE
      AND d.expires_at - CURRENT_DATE <= d.notify_days_before
      AND d.last_notified_on IS DISTINCT FROM CURRENT_DATE
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    SELECT ur.user_id, 'document_expiry', 'Documento próximo do vencimento',
      doc.title || ' — ' || doc.client_name || ' vence em ' || to_char(doc.expires_at, 'DD/MM/YYYY') || '.'
    FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role;
    UPDATE public.client_documents SET last_notified_on = CURRENT_DATE WHERE id = doc.id;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.jacoby_process_document_alerts() TO authenticated;
