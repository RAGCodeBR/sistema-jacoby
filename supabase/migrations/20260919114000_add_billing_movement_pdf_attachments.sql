-- Um comprovante em PDF pode ser vinculado a cada movimentação do boletim.
ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'movement-documents',
  'movement-documents',
  false,
  15728640,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS jacoby_movement_documents_read ON storage.objects;
CREATE POLICY jacoby_movement_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'movement-documents'
    AND (
      public.has_app_permission('billing')
      OR EXISTS (
        SELECT 1
        FROM public.billing_v2_movements AS movement
        JOIN public.billing_v2_cycles AS cycle ON cycle.id = movement.cycle_id
        JOIN public.client_user_links AS link ON link.client_id = cycle.client_id
        WHERE movement.attachment_path = storage.objects.name
          AND movement.confirmed
          AND link.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS jacoby_movement_documents_upload ON storage.objects;
CREATE POLICY jacoby_movement_documents_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'movement-documents'
    AND public.has_app_permission('billing')
  );

DROP POLICY IF EXISTS jacoby_movement_documents_delete ON storage.objects;
CREATE POLICY jacoby_movement_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'movement-documents'
    AND public.has_app_permission('billing')
  );

-- O portal retorna somente o nome e o caminho do PDF daquela movimentação,
-- e o acesso ao arquivo continua condicionado à política acima.
DROP FUNCTION IF EXISTS public.jacoby_client_confirmed_movements();
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
  observation TEXT,
  attachment_name TEXT,
  attachment_path TEXT
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
    movement.observation,
    movement.attachment_name,
    movement.attachment_path
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

NOTIFY pgrst, 'reload schema';
