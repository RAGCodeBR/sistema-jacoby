-- A antiga política liberava todos os clientes para todo usuário autenticado.
-- A RAG é exclusivamente demonstrativa: a equipe interna não a vê em listas,
-- buscas ou seletores; o login associado à RAG continua podendo ler o próprio
-- cadastro por current_client_id().
DROP POLICY IF EXISTS clients_all_auth ON public.clients;
DROP POLICY IF EXISTS clients_select_auth ON public.clients;

CREATE POLICY clients_select_auth ON public.clients
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'client'::public.app_role) AND id = public.current_client_id())
    OR (
      NOT public.has_role(auth.uid(), 'client'::public.app_role)
      AND NOT is_demo
    )
  );

-- Clientes demonstrativos não podem ser alterados pelos fluxos internos.
DROP POLICY IF EXISTS clients_internal_manage ON public.clients;
CREATE POLICY clients_internal_manage ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.has_role(auth.uid(), 'client'::public.app_role)
    AND NOT is_demo
  );

CREATE POLICY clients_internal_update ON public.clients
  FOR UPDATE TO authenticated
  USING (NOT public.has_role(auth.uid(), 'client'::public.app_role) AND NOT is_demo)
  WITH CHECK (NOT public.has_role(auth.uid(), 'client'::public.app_role) AND NOT is_demo);

CREATE POLICY clients_internal_delete ON public.clients
  FOR DELETE TO authenticated
  USING (NOT public.has_role(auth.uid(), 'client'::public.app_role) AND NOT is_demo);

NOTIFY pgrst, 'reload schema';
