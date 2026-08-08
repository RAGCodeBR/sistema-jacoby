# Sistema Jacoby

Sistema de gestão da Jacoby Soluções, criado como uma cópia independente e vazia da base de referência.

## Segurança da cópia

- Não contém dados, clientes, tarefas, usuários, anexos ou credenciais da base original.
- O banco de dados será configurado em um projeto Supabase novo.
- As migrações em `supabase/migrations` preservam a estrutura necessária para as funcionalidades do sistema.

## Publicação

O projeto gera uma versão estática compatível com GitHub Pages por meio de `npm run build:pages`.

## Para abrir no VS Code

Comece por [docs/MAPA_DO_CODIGO.md](docs/MAPA_DO_CODIGO.md). Ele explica, em linguagem simples, onde fica cada área do sistema e qual arquivo deve ser alterado para cada tipo de mudança.

Resumo da estrutura:

- `src/routes/`: telas e URLs do sistema.
- `src/components/`: componentes reutilizáveis da interface.
- `src/hooks/`: autenticação, consultas e regras compartilhadas de dados.
- `src/lib/`: funções de apoio por funcionalidade.
- `src/integrations/`: conexão com Supabase e tipagens do banco.
- `supabase/migrations/`: alterações versionadas da estrutura do banco.
- `docs/`: mapas e decisões de arquitetura; não interfere na execução.

## Comandos seguros

- `npm run dev`: abre o sistema para desenvolvimento local.
- `npm run build:pages`: compila a versão estática usada no GitHub Pages.
- `npm run lint`: verifica problemas de qualidade de código.

As pastas de execução não foram movidas nesta organização. Isso mantém todas as importações, rotas e publicação existentes intactas.
