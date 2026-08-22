-- Allows an authenticated administrator to set a password from the Users area.
-- This is intentionally restricted to the existing admin role and is used by
-- the direct password reset action in the static GitHub Pages application.
create or replace function public.admin_reset_user_password(target_user_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $body$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Somente administradores podem redefinir senhas.';
  end if;

  if length(new_password) < 6 then
    raise exception 'A nova senha deve ter ao menos 6 caracteres.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = target_user_id;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;
end;
$body$;

revoke all on function public.admin_reset_user_password(uuid, text) from public;
grant execute on function public.admin_reset_user_password(uuid, text) to authenticated;
