# Banco de dados e migrations

Cada arquivo em `migrations/` descreve uma mudança no banco: tabela, coluna, permissão, função ou automação.

Regras:

1. Para uma alteração nova, crie outro arquivo com data/hora no começo do nome.
2. Não edite migrations que já foram aplicadas no Supabase.
3. Teste primeiro em um ambiente seguro quando a alteração envolver dados existentes.
4. Políticas RLS definem o que cada perfil pode ler ou alterar.

As migrations da Jacoby são independentes da base original do TaskFlow.
