-- O ambiente RAG é exclusivamente demonstrativo. Recompõe exemplos já
-- existentes de tarefas concluídas para o histórico dobrável do portal, sem
-- criar registros no fluxo interno da Jacoby ou em outros clientes.
INSERT INTO public.tasks (
  title, description, status, priority, client_id, due_date, completed_at,
  client_portal_visible, client_document_request, is_demo
)
SELECT
  item.title,
  item.description,
  'done'::public.task_status,
  item.priority::public.task_priority,
  client.id,
  item.due_date,
  item.completed_at,
  false,
  false,
  true
FROM public.clients AS client
CROSS JOIN (VALUES
  ('Consolidar relatório mensal de resíduos', 'Relatório mensal conferido e disponibilizado para consulta.', 'medium', DATE '2026-09-12', TIMESTAMPTZ '2026-09-13 14:30:00-03'),
  ('Validar documentos da coleta anterior', 'Documentação recebida, validada e arquivada no acompanhamento ambiental.', 'high', DATE '2026-08-28', TIMESTAMPTZ '2026-08-29 10:15:00-03')
) AS item(title, description, priority, due_date, completed_at)
WHERE client.is_demo
  AND NOT EXISTS (
    SELECT 1
    FROM public.tasks task
    WHERE task.client_id = client.id
      AND task.title = item.title
  );

NOTIFY pgrst, 'reload schema';
