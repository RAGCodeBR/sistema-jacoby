# Integrações

Aqui ficam as conexões externas do sistema.

- `supabase/client.ts`: cliente usado pelo navegador para ler e gravar os dados permitidos.
- `supabase/types.ts`: tipos gerados/espelhados das tabelas; ajudam o TypeScript a detectar erros.
- `supabase/auth-*`: apoio à autenticação e envio de sessão.

Nunca salve chaves secretas nesta pasta ou no GitHub Pages. O navegador usa somente a chave pública do projeto.
