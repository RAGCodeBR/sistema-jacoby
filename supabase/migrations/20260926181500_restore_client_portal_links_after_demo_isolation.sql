-- O isolamento da RAG não pode depender de current_client_id(), pois alguns
-- logins de portal carregam o vínculo antes da função auxiliar. A checagem
-- direta preserva TODOS os portais de clientes ativos e libera a RAG apenas
-- para o próprio usuário associado.
DROP POLICY IF EXISTS clients_select_auth ON public.clients;
CREATE POLICY clients_select_auth ON public.clients
  FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'client'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.client_user_links link
        WHERE link.client_id = clients.id AND link.user_id = auth.uid()
      )
    )
    OR (
      NOT public.has_role(auth.uid(), 'client'::public.app_role)
      AND NOT is_demo
    )
  );

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'client'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.client_user_links link
        WHERE link.client_id = tasks.client_id AND link.user_id = auth.uid()
      )
    )
    OR (
      NOT public.has_role(auth.uid(), 'client'::public.app_role)
      AND NOT is_demo
      AND public.can_view_task(id)
    )
  );

NOTIFY pgrst, 'reload schema';
