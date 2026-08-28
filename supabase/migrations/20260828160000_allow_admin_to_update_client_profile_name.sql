-- Mantém o nome do responsável do portal sincronizado tanto no perfil público
-- quanto nos metadados do login, sem depender de permissões diretas do browser.
CREATE OR REPLACE FUNCTION public.admin_update_client_profile_name(
  target_user_id uuid,
  new_full_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $body$
DECLARE
  normalized_name text := trim(new_full_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Somente administradores podem alterar dados de acesso de clientes.';
  END IF;

  IF normalized_name IS NULL OR char_length(normalized_name) < 2 THEN
    RAISE EXCEPTION 'Informe um nome completo com pelo menos 2 caracteres.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = target_user_id AND role = 'client'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Este acesso não é um cliente vinculado ao portal.';
  END IF;

  UPDATE public.profiles
  SET full_name = normalized_name, updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', normalized_name),
      updated_at = now()
  WHERE id = target_user_id;
END;
$body$;

REVOKE ALL ON FUNCTION public.admin_update_client_profile_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_client_profile_name(uuid, text) TO authenticated;
