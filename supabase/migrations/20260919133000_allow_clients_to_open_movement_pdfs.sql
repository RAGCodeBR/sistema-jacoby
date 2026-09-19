-- A leitura do objeto precisa ocorrer sem a RLS da tabela de anexos bloquear
-- a verificação feita pela política do Storage.
CREATE OR REPLACE FUNCTION public.can_read_movement_document(target_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_app_permission('billing')
    OR EXISTS (
      SELECT 1
      FROM public.billing_v2_movement_attachments AS attachment
      JOIN public.billing_v2_movements AS movement ON movement.id = attachment.movement_id
      JOIN public.billing_v2_cycles AS cycle ON cycle.id = movement.cycle_id
      JOIN public.client_user_links AS link ON link.client_id = cycle.client_id
      WHERE attachment.storage_path = target_path
        AND movement.confirmed
        AND link.user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_movement_document(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_movement_document(TEXT) TO authenticated;

DROP POLICY IF EXISTS jacoby_movement_documents_read ON storage.objects;
CREATE POLICY jacoby_movement_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'movement-documents'
    AND public.can_read_movement_document(name)
  );
