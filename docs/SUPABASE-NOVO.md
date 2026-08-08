# Banco Supabase novo

Este projeto deve usar um Supabase separado do Lovable/original e separado da copia atual.

## Passos

1. Crie um projeto novo no Supabase.
2. Copie `Project URL` e `anon public key`.
3. Rode as migrations em `supabase/migrations` no banco novo.
4. Configure o build com:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_ANON_PUBLIC_KEY
```

## Projeto criado nesta copia

- Project ref: `xlcurhbxexyunpkcswwo`
- Project URL: `https://xlcurhbxexyunpkcswwo.supabase.co`
- Plano observado no painel: Free/Livre

## Por que as chaves entram no build?

GitHub Pages e um host estatico. Nao existe backend lendo `.env` em runtime. O Vite substitui `VITE_*` quando gera os arquivos finais.

## O que nao copiar

- Nao copie dados do Supabase antigo.
- Nao use `service_role` no frontend.
- Nao misture migrations novas no projeto Lovable.
- Nao use a URL antiga do banco atual.
