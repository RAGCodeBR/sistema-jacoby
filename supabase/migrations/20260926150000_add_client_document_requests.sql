-- Solicitações documentais do Kanban que podem ser visualizadas e respondidas pelo cliente.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS client_portal_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_document_request boolean NOT NULL DEFAULT false;

ALTER TABLE public.billing_v2_cycles
  ADD COLUMN IF NOT EXISTS client_portal_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tasks_client_portal_requests_idx
  ON public.tasks (client_id, client_portal_visible, client_document_request, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS billing_v2_cycles_client_portal_idx
  ON public.billing_v2_cycles (client_id, finalized_at DESC)
  WHERE status = 'closed' AND client_portal_visible = true;

DROP POLICY IF EXISTS jacoby_client_read_document_requests ON public.tasks;
CREATE POLICY jacoby_client_read_document_requests ON public.tasks FOR SELECT TO authenticated
USING (
  client_portal_visible
  AND client_document_request
  AND client_id IN (SELECT client_id FROM public.client_user_links WHERE user_id = auth.uid())
  AND deleted_at IS NULL
);

DROP POLICY IF EXISTS jacoby_client_read_document_request_files ON public.attachments;
CREATE POLICY jacoby_client_read_document_request_files ON public.attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tasks t
  JOIN public.client_user_links l ON l.client_id = t.client_id
  WHERE t.id = attachments.task_id
    AND t.client_portal_visible
    AND t.client_document_request
    AND l.user_id = auth.uid()
));

DROP POLICY IF EXISTS jacoby_client_upload_document_request_files ON public.attachments;
CREATE POLICY jacoby_client_upload_document_request_files ON public.attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_user_links l ON l.client_id = t.client_id
    WHERE t.id = attachments.task_id
      AND t.client_portal_visible
      AND t.client_document_request
      AND l.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS jacoby_client_read_published_bulletins ON public.billing_v2_cycles;
CREATE POLICY jacoby_client_read_published_bulletins ON public.billing_v2_cycles FOR SELECT TO authenticated
USING (
  status = 'closed'
  AND client_portal_visible
  AND client_id IN (SELECT client_id FROM public.client_user_links WHERE user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
