-- A conexão do OneDrive pertence exclusivamente à administradora responsável
-- pela central de Arquivos. Tokens só são acessados pelo servidor via service role.
CREATE TABLE IF NOT EXISTS public.onedrive_oauth_states (
  state UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onedrive_connections (
  owner_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_name TEXT,
  account_email TEXT,
  drive_id TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.onedrive_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.onedrive_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.onedrive_connections FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
