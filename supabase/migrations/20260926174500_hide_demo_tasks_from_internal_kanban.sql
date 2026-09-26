-- A política legada abaixo liberava TODAS as tarefas para qualquer login e
-- anulava a separação do ambiente demonstrativo. Mantemos o acesso de escrita
-- interno, mas nunca para as tarefas is_demo; o cliente RAG continua lendo as
-- próprias tarefas pela política tasks_select.
DROP POLICY IF EXISTS tasks_all_auth ON public.tasks;

DROP POLICY IF EXISTS tasks_internal_insert ON public.tasks;
CREATE POLICY tasks_internal_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND auth.uid() IS NOT NULL
    AND NOT is_demo
  );

DROP POLICY IF EXISTS tasks_internal_update ON public.tasks;
CREATE POLICY tasks_internal_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND NOT is_demo
    AND public.can_view_task(id)
  )
  WITH CHECK (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND NOT is_demo
    AND public.can_view_task(id)
  );

DROP POLICY IF EXISTS tasks_internal_delete ON public.tasks;
CREATE POLICY tasks_internal_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND NOT is_demo
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR created_by = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
