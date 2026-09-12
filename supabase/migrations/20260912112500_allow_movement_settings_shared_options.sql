-- Quem recebeu Configurações de movimentação pode manter as sugestões reutilizáveis
-- usadas ao cadastrar equipamentos e tipos padrão de resíduos.
CREATE POLICY waste_equipment_options_movement_settings_manage
  ON public.waste_equipment_options
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));

CREATE POLICY waste_residue_types_movement_settings_manage
  ON public.waste_residue_types
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));

NOTIFY pgrst, 'reload schema';
