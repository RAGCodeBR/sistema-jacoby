-- Permite que administradores alterem, diretamente pela tela de Usuários,
-- o login/e-mail de acessos vinculados ao Portal do Cliente.
-- Não envia e-mail de confirmação: o novo login passa a valer na hora.
CREATE OR REPLACE FUNCTION public.admin_update_client_email(
  target_user_id uuid,
  new_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $body$
DECLARE
  normalized_email text := lower(trim(new_email));
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar credenciais de clientes.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'client'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Este acesso não é um cliente vinculado ao portal.';
  END IF;

  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = normalized_email AND id <> target_user_id) THEN
    RAISE EXCEPTION 'Já existe um acesso com este e-mail.';
  END IF;

  UPDATE auth.users
     SET email = normalized_email,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  UPDATE public.profiles
     SET email = normalized_email,
         updated_at = now()
   WHERE id = target_user_id;
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_update_client_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_client_email(uuid, text) TO authenticated;
