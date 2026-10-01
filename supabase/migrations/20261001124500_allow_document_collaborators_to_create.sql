-- Colaboradores com a permissão "documents" podem cadastrar novos documentos,
-- sem alterar ou excluir os documentos que já existem.
DROP POLICY IF EXISTS jacoby_client_documents_documents_create ON public.client_documents;
CREATE POLICY jacoby_client_documents_documents_create ON public.client_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_app_permission('documents'));

DROP POLICY IF EXISTS jacoby_client_documents_storage_documents_create ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_documents_create ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND public.has_app_permission('documents')
  );

NOTIFY pgrst, 'reload schema';
