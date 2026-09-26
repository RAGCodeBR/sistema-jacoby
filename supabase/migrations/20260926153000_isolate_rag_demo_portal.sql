-- O cliente RAG é um ambiente demonstrativo. Seus dados não devem poluir as
-- listas operacionais internas, mas continuam disponíveis para o próprio login.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE public.clients
SET is_demo = true
WHERE lower(trim(name)) = 'rag';

UPDATE public.billing_v2_cycles
SET is_demo = true,
    client_portal_visible = true
WHERE client_id IN (SELECT id FROM public.clients WHERE is_demo = true);

-- A instalação atual perdeu esta função auxiliar usada pelas políticas de
-- tarefas. Recriamos a regra já adotada pelo Kanban antes de aplicá-la abaixo.
CREATE OR REPLACE FUNCTION public.can_view_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks task
    WHERE task.id = _task_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR task.assignee_id = auth.uid()
        OR task.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.task_collaborators collaborator
          WHERE collaborator.task_id = task.id AND collaborator.collaborator_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.subtasks subtask
          WHERE subtask.task_id = task.id AND subtask.assignee_id = auth.uid()
        )
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_view_task(uuid) TO authenticated;

DROP POLICY IF EXISTS clients_select_auth ON public.clients;
CREATE POLICY clients_select_auth ON public.clients
  FOR SELECT TO authenticated
  USING (
    NOT is_demo
    OR id = public.current_client_id()
  );

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'client'::public.app_role) AND client_id = public.current_client_id())
    OR (
      NOT public.has_role(auth.uid(), 'client'::public.app_role)
      AND NOT is_demo
      AND public.can_view_task(id)
    )
  );

-- Serviços demonstrativos, vinculados somente ao RAG e reaproveitados nos BMs.
INSERT INTO public.waste_services (client_id, name, default_rate)
SELECT client.id, service.name, service.default_rate
FROM public.clients AS client
CROSS JOIN (VALUES
  ('Coleta e transporte de resíduos', 780.00::numeric),
  ('Destinação ambiental certificada', 1240.00::numeric),
  ('Locação e higienização de caçamba', 460.00::numeric)
) AS service(name, default_rate)
WHERE client.is_demo
ON CONFLICT (client_id, name) DO NOTHING;

INSERT INTO public.billing_v2_cycle_services (
  cycle_id, waste_service_id, amount, execution_date, service_order, description
)
SELECT
  cycle.id,
  service.id,
  CASE (row_number() OVER (PARTITION BY cycle.id ORDER BY service.name) % 3)
    WHEN 1 THEN 780.00::numeric
    WHEN 2 THEN 1240.00::numeric
    ELSE 460.00::numeric
  END,
  cycle.period_start + ((cycle.bulletin_number % 12)::integer),
  'DEMO-RAG-SERV-' || cycle.bulletin_number,
  'Serviço demonstrativo para visualização no portal do cliente.'
FROM public.billing_v2_cycles AS cycle
JOIN public.clients AS client ON client.id = cycle.client_id AND client.is_demo
JOIN public.waste_services AS service ON service.client_id = client.id
ON CONFLICT (cycle_id, waste_service_id, outsourced_company_id) DO NOTHING;

-- Solicitações de documento visíveis somente no portal demonstrativo.
INSERT INTO public.tasks (
  title, description, status, priority, client_id, due_date,
  client_portal_visible, client_document_request, is_demo
)
SELECT
  request.title,
  request.description,
  'todo',
  'high',
  client.id,
  request.due_date,
  true,
  true,
  true
FROM public.clients AS client
CROSS JOIN (VALUES
  ('Enviar MTRs das coletas de setembro', 'Anexe os MTRs correspondentes às movimentações concluídas no período.', CURRENT_DATE + 5),
  ('Atualizar licença ambiental', 'Envie a licença ambiental vigente da unidade e o comprovante de renovação, se houver.', CURRENT_DATE + 12),
  ('Comprovantes de destinação', 'Anexe os certificados ou comprovantes de destinação final dos resíduos.', CURRENT_DATE + 20)
) AS request(title, description, due_date)
WHERE client.is_demo
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks task
    WHERE task.client_id = client.id
      AND task.title = request.title
  );

DROP POLICY IF EXISTS jacoby_client_read_published_bulletin_services ON public.billing_v2_cycle_services;
CREATE POLICY jacoby_client_read_published_bulletin_services ON public.billing_v2_cycle_services
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.billing_v2_cycles cycle
      JOIN public.client_user_links link ON link.client_id = cycle.client_id
      WHERE cycle.id = billing_v2_cycle_services.cycle_id
        AND cycle.status = 'closed'
        AND cycle.client_portal_visible
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
