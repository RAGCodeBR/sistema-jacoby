-- Mantém qualquer tarefa da RAG estritamente como demonstração: ela continua
-- disponível somente para o login do cliente RAG e não entra no Kanban interno.
UPDATE public.tasks
SET is_demo = true
WHERE client_id IN (SELECT id FROM public.clients WHERE is_demo = true);

-- Etapas futuras, com distribuição entre as colunas para demonstrar o fluxo
-- completo do Kanban ao cliente sem criar tarefas no ambiente real da Jacoby.
INSERT INTO public.tasks (
  title, description, status, priority, client_id, due_date,
  client_portal_visible, client_document_request, is_demo
)
SELECT
  item.title, item.description, item.status::public.task_status, item.priority::public.task_priority, client.id, item.due_date,
  false, false, true
FROM public.clients AS client
CROSS JOIN (VALUES
  ('Programar coleta complementar', 'Definir a janela de coleta complementar para os resíduos de maior volume.', 'in_progress', 'medium', DATE '2026-10-15'),
  ('Validar certificados de destinação', 'Conferir os certificados recebidos e validar a documentação do período.', 'review', 'high', DATE '2026-10-28'),
  ('Revisar inventário de equipamentos', 'Confirmar os equipamentos em operação por unidade e registrar eventuais ajustes.', 'todo', 'medium', DATE '2026-11-12'),
  ('Atualizar plano de gerenciamento', 'Preparar a atualização anual do plano de gerenciamento de resíduos.', 'todo', 'high', DATE '2026-11-26'),
  ('Agendar treinamento operacional', 'Organizar o treinamento da equipe sobre segregação e acondicionamento.', 'in_progress', 'low', DATE '2026-12-08'),
  ('Conferir indicadores ambientais', 'Revisar os indicadores consolidados antes do fechamento anual.', 'review', 'medium', DATE '2026-12-18'),
  ('Planejar calendário de coletas 2027', 'Definir o calendário inicial de coletas e entregas documentais.', 'todo', 'high', DATE '2027-01-15')
) AS item(title, description, status, priority, due_date)
WHERE client.is_demo
  AND NOT EXISTS (
    SELECT 1 FROM public.tasks task
    WHERE task.client_id = client.id AND task.title = item.title
  );

NOTIFY pgrst, 'reload schema';
