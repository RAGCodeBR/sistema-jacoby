# Hooks

Hooks concentram estados e comunicação com dados para as telas ficarem mais fáceis de ler.

- `use-auth.tsx`: sessão, perfil, categoria de usuário, permissões e saída do sistema.
- `use-data.ts`: consultas de tarefas, clientes, colunas, tags, arquivos e demais dados do Supabase.
- `use-board-preferences.ts`: preferências do Kanban, como a visualização vertical/horizontal.
- `use-mobile.tsx`: detecção de tela pequena.

Ao criar uma nova consulta ao Supabase, prefira um hook aqui em vez de espalhar chamadas diretas em várias telas.
