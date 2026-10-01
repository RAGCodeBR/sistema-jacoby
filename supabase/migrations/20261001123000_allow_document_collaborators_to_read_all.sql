-- A permissão de tela "documents" também precisa liberar a leitura no banco.
-- Ela não concede inserir, editar ou excluir documentos de outros usuários.
DROP POLICY IF EXISTS jacoby_client_documents_documents_read ON public.client_documents;
CREATE POLICY jacoby_client_documents_documents_read ON public.client_documents
  FOR SELECT TO authenticated
  USING (public.has_app_permission('documents'));

DROP POLICY IF EXISTS jacoby_client_documents_storage_documents_read ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND public.has_app_permission('documents')
    AND EXISTS (
      SELECT 1 FROM public.client_documents document
      WHERE document.storage_path = storage.objects.name
    )
  );

NOTIFY pgrst, 'reload schema';
