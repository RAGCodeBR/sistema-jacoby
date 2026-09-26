-- O portal do cliente acompanha o Kanban da própria empresa, sem políticas
-- de escrita: clientes continuam sem inserir, editar, mover ou excluir tarefas.
DROP POLICY IF EXISTS jacoby_client_read_project_columns ON public.kanban_columns;
CREATE POLICY jacoby_client_read_project_columns ON public.kanban_columns
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'client'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.tasks task
      JOIN public.client_user_links link ON link.client_id = task.client_id
      WHERE task.column_id = kanban_columns.id
        AND task.deleted_at IS NULL
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
