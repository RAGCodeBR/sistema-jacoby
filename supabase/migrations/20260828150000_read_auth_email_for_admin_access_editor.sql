-- O e-mail comercial do cliente (clients.email) é diferente do login do portal.
-- Esta função retorna o e-mail de auth.users, que é a fonte real do acesso.
CREATE OR REPLACE FUNCTION public.admin_get_profile_emails()
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $body$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem consultar logins de acesso.';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u;
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_get_profile_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_emails() TO authenticated;
