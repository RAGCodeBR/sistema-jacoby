# Mapa do código — Sistema Jacoby

Este arquivo é o ponto de partida para quem abrir o projeto no VS Code. Ele não executa nada e não altera o sistema.

## Como o sistema se organiza

```text
src/
├── routes/          Telas e URLs
├── components/      Blocos reutilizáveis da interface
│   └── ui/          Componentes visuais básicos (botão, modal, campo etc.)
├── hooks/           Autenticação, dados e preferências
├── integrations/    Cliente Supabase e tipos do banco
├── lib/             Regras e funções auxiliares por assunto
├── assets/          Logo e imagens da Jacoby
└── styles.css       Tema, cores e estilos globais

supabase/
└── migrations/      Histórico do banco de dados, em ordem cronológica
```

## Por onde começar

| Se você quer entender ou alterar | Abra primeiro |
| --- | --- |
| Menu lateral, nome do sistema, sino e tema | `src/components/AppShell.tsx` |
| Login, perfil, categorias de usuário e permissões | `src/hooks/use-auth.tsx` |
| Leitura e atualização de tarefas, clientes e dados | `src/hooks/use-data.ts` |
| Kanban, colunas, arrastar tarefas e concluídas | `src/routes/_app/tasks.kanban.tsx` |
| Cadastro e edição de clientes | `src/routes/_app/clients.tsx` e `clients.$clientId.edit.tsx` |
| Controle de documentos de um cliente | `src/components/ClientDocumentsManager.tsx` |
| Documentos vistos pelo cliente | `src/routes/_app/portal.documentos.tsx` |
| Portal do cliente: financeiro e entregas | `src/routes/_app/portal.*.tsx` |
| Criar/editar conteúdo de uma tarefa | `src/components/TaskDialog.tsx` e `TaskCard.tsx` |
| Notificações | `src/components/NotificationBell.tsx` e `AssignmentPopup.tsx` |
| Estrutura do banco | `supabase/migrations/` |

## Rotas principais

Arquivos dentro de `src/routes/` viram URLs automaticamente:

| Arquivo | URL |
| --- | --- |
| `_app/dashboard.tsx` | `/dashboard` |
| `_app/tasks.kanban.tsx` | `/tasks/kanban` |
| `_app/clients.tsx` | `/clients` |
| `_app/portal.documentos.tsx` | `/portal/documentos` |
| `_app/users.tsx` | `/users` |

`src/routes/_app.tsx` protege as telas internas. `src/routes/__root.tsx` é a moldura global. `src/routeTree.gen.ts` é gerado a partir das rotas e não deve receber lógica de negócio.

## Fluxo dos dados

1. A tela usa um hook de `src/hooks/`.
2. O hook conversa com `src/integrations/supabase/client.ts`.
3. O Supabase aplica autenticação e permissões.
4. As tabelas e políticas são criadas pelas migrações em `supabase/migrations/`.

## Regras importantes antes de alterar

- Não altere a base original do TaskFlow; este repositório é independente.
- Antes de mudar o banco, crie uma nova migration. Nunca edite uma migration já aplicada.
- Não coloque chaves privadas no código ou no GitHub Pages.
- Após mudanças na interface, execute `npm run build:pages`.
- Prefira criar componentes novos em vez de concentrar regras grandes dentro das páginas.

## Convenção de nomes

- `*.tsx`: tela ou componente React.
- `use-*.ts` / `use-*.tsx`: hook React, normalmente responsável por dados ou estado.
- `*.functions.ts`: funções de apoio sem tela.
- `portal.*.tsx`: seção específica do Portal do Cliente.
- `clients.$clientId.edit.tsx`: rota dinâmica para editar um cliente pelo identificador.
