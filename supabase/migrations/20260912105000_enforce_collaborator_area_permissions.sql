-- As permissões escolhidas no cadastro de colaboradores também precisam valer no banco.
-- Esta função não expõe a lista de permissões: ela responde apenas se a área solicitada
-- está liberada para o usuário autenticado.
CREATE OR REPLACE FUNCTION public.has_app_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = auth.uid()
        AND required_permission = ANY(permissions)
    )
$$;

-- Faturamento: boletim, locações, movimentações, valores e serviços do boletim.
CREATE POLICY billing_v2_cycles_billing_manage ON public.billing_v2_cycles FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));
CREATE POLICY billing_v2_placements_billing_manage ON public.billing_v2_placements FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));
CREATE POLICY billing_v2_movements_billing_manage ON public.billing_v2_movements FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));
CREATE POLICY billing_v2_rates_billing_manage ON public.billing_v2_rates FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));
CREATE POLICY billing_v2_cycle_services_billing_manage ON public.billing_v2_cycle_services FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

-- Dados de apoio usados para montar o boletim.
CREATE POLICY client_branches_billing_read ON public.client_branches FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY waste_equipment_billing_read ON public.waste_equipment FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY waste_residues_billing_read ON public.waste_residues FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY waste_services_billing_read ON public.waste_services FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY waste_client_billing_settings_billing_read ON public.waste_client_billing_settings FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY outsourced_companies_billing_read ON public.outsourced_companies FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));
CREATE POLICY outsourced_company_services_billing_read ON public.outsourced_company_services FOR SELECT TO authenticated
  USING (public.has_app_permission('billing'));

-- Configurações de movimentação: catálogo, equipamentos e valores comerciais.
CREATE POLICY client_branches_movement_settings_manage ON public.client_branches FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY waste_equipment_movement_settings_manage ON public.waste_equipment FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY waste_residues_movement_settings_manage ON public.waste_residues FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY waste_services_movement_settings_manage ON public.waste_services FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY waste_client_billing_settings_movement_settings_manage ON public.waste_client_billing_settings FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));

-- Cadastro de terceirizados e o vínculo de seus serviços.
CREATE POLICY outsourced_companies_outsourced_manage ON public.outsourced_companies FOR ALL TO authenticated
  USING (public.has_app_permission('outsourced'))
  WITH CHECK (public.has_app_permission('outsourced'));
CREATE POLICY outsourced_company_services_outsourced_manage ON public.outsourced_company_services FOR ALL TO authenticated
  USING (public.has_app_permission('outsourced'))
  WITH CHECK (public.has_app_permission('outsourced'));

NOTIFY pgrst, 'reload schema';
