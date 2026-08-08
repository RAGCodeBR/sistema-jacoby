# Componentes

Esta pasta guarda os blocos reutilizáveis que aparecem em mais de uma tela.

- `AppShell.tsx`: estrutura geral, menu, topo e notificações.
- `TaskCard.tsx`: cartão apresentado no Kanban.
- `TaskDialog.tsx`: criação e edição de tarefas.
- `ClientDocumentsManager.tsx`: administração de documentos e vencimentos no cadastro do cliente.
- `NotificationBell.tsx`: sino e lista de notificações.
- `AssignmentPopup.tsx`: aviso imediato quando uma tarefa é atribuída.
- `ui/`: biblioteca visual básica. Evite colocar regra de negócio nessa subpasta.

Uma página em `src/routes/` deve montar componentes; consultas ao banco devem preferencialmente ficar em `src/hooks/`.
