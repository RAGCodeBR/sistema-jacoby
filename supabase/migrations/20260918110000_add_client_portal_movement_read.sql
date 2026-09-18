-- O cliente consulta somente suas movimentações confirmadas, sem campos financeiros.
CREATE OR REPLACE FUNCTION public.jacoby_client_confirmed_movements()
RETURNS TABLE (
  id UUID,
  occurred_on DATE,
  branch_name TEXT,
  residue_name TEXT,
  removed_equipment TEXT,
  placed_equipment TEXT,
  placed_quantity NUMERIC,
  removed_quantity NUMERIC,
  weight_kg NUMERIC,
  service_order TEXT,
  observation TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    movement.id,
    movement.occurred_on,
    branch.name,
    residue.name,
    COALESCE(NULLIF(removed.identification, ''), NULLIF(removed.name, ''), '—'),
    COALESCE(NULLIF(placed.identification, ''), NULLIF(placed.name, ''), '—'),
    movement.placed_quantity,
    movement.removed_quantity,
    movement.weight_kg,
    movement.service_order,
    movement.observation
  FROM public.billing_v2_movements AS movement
  JOIN public.billing_v2_cycles AS cycle ON cycle.id = movement.cycle_id
  JOIN public.client_branches AS branch ON branch.id = movement.branch_id
  LEFT JOIN public.waste_residues AS residue ON residue.id = movement.waste_residue_id
  LEFT JOIN public.waste_equipment AS removed ON removed.id = movement.equipment_id
  LEFT JOIN public.waste_equipment AS placed ON placed.id = movement.replacement_equipment_id
  WHERE movement.confirmed
    AND EXISTS (
      SELECT 1
      FROM public.client_user_links AS link
      WHERE link.user_id = auth.uid()
        AND link.client_id = cycle.client_id
    )
  ORDER BY movement.occurred_on DESC, movement.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.jacoby_client_confirmed_movements() TO authenticated;

-- Os documentos ativos do cliente permanecem consultáveis mesmo depois de vencidos.
DROP POLICY IF EXISTS jacoby_client_documents_client_read_current ON public.client_documents;
CREATE POLICY jacoby_client_documents_client_read_current ON public.client_documents
  FOR SELECT TO authenticated
  USING (
    active
    AND EXISTS (
      SELECT 1 FROM public.client_user_links AS link
      WHERE link.client_id = client_documents.client_id AND link.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS jacoby_client_documents_storage_client_read ON storage.objects;
CREATE POLICY jacoby_client_documents_storage_client_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND EXISTS (
      SELECT 1
      FROM public.client_documents AS doc
      JOIN public.client_user_links AS link ON link.client_id = doc.client_id
      WHERE doc.storage_path = name
        AND doc.active
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
