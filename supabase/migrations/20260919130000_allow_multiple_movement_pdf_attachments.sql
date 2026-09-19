-- Vários PDFs podem acompanhar uma mesma movimentação.
CREATE TABLE IF NOT EXISTS public.billing_v2_movement_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES public.billing_v2_movements(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_v2_movement_attachments_movement_idx
  ON public.billing_v2_movement_attachments (movement_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_v2_movement_attachments TO authenticated;
ALTER TABLE public.billing_v2_movement_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_v2_movement_attachments_billing_manage ON public.billing_v2_movement_attachments;
CREATE POLICY billing_v2_movement_attachments_billing_manage ON public.billing_v2_movement_attachments
  FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

-- Preserva o primeiro PDF que já existia antes da lista de anexos.
INSERT INTO public.billing_v2_movement_attachments (movement_id, file_name, storage_path)
SELECT id, attachment_name, attachment_path
FROM public.billing_v2_movements
WHERE attachment_path IS NOT NULL
  AND attachment_name IS NOT NULL
ON CONFLICT (storage_path) DO NOTHING;

DROP POLICY IF EXISTS jacoby_movement_documents_read ON storage.objects;
CREATE POLICY jacoby_movement_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'movement-documents'
    AND (
      public.has_app_permission('billing')
      OR EXISTS (
        SELECT 1
        FROM public.billing_v2_movement_attachments AS attachment
        JOIN public.billing_v2_movements AS movement ON movement.id = attachment.movement_id
        JOIN public.billing_v2_cycles AS cycle ON cycle.id = movement.cycle_id
        JOIN public.client_user_links AS link ON link.client_id = cycle.client_id
        WHERE attachment.storage_path = storage.objects.name
          AND movement.confirmed
          AND link.user_id = auth.uid()
      )
    )
  );

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
  attachments JSONB
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
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', attachment.id, 'name', attachment.file_name, 'path', attachment.storage_path) ORDER BY attachment.created_at)
      FROM public.billing_v2_movement_attachments AS attachment
      WHERE attachment.movement_id = movement.id
    ), '[]'::jsonb)
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
