-- Regra LDJ para locacao e troca:
-- primeiro abate o imposto sobre o valor faturado e, depois, calcula a
-- comissao da Jacoby sobre o saldo. Tratamento continua abatendo somente a
-- parcela da Jacoby, conforme regra comercial.
CREATE OR REPLACE FUNCTION public.sync_outsourced_cycle_commissions(target_cycle_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cycle_row public.billing_v2_cycles%ROWTYPE;
  settings_row public.outsourced_commission_settings%ROWTYPE;
BEGIN
  SELECT * INTO cycle_row FROM public.billing_v2_cycles WHERE id = target_cycle_id;
  IF NOT FOUND OR cycle_row.status <> 'closed' OR cycle_row.issuer_type <> 'outsourced' OR cycle_row.outsourced_company_id IS NULL THEN
    DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
    RETURN;
  END IF;

  SELECT * INTO settings_row
  FROM public.outsourced_commission_settings
  WHERE client_id = cycle_row.client_id
    AND outsourced_company_id = cycle_row.outsourced_company_id
    AND active
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
    RETURN;
  END IF;

  -- Locacao: valor do BM - abatimento, depois percentual da Jacoby.
  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount,
    tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, settings_row.id,
    'rental', placement.id, placement.waste_residue_id, placement.started_on,
    ROUND(placement.quantity * placement.monthly_rental_rate, 2), settings_row.rental_commission_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - settings_row.tax_withholding_rate / 100) * settings_row.rental_commission_rate / 100, 2),
    settings_row.tax_withholding_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * settings_row.tax_withholding_rate / 100, 2),
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - settings_row.tax_withholding_rate / 100) * settings_row.rental_commission_rate / 100, 2)
  FROM public.billing_v2_placements placement
  WHERE placement.cycle_id = cycle_row.id
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, waste_residue_id = EXCLUDED.waste_residue_id,
    execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount, commission_rate = EXCLUDED.commission_rate,
    gross_commission_amount = EXCLUDED.gross_commission_amount, tax_withholding_rate = EXCLUDED.tax_withholding_rate,
    tax_withheld_amount = EXCLUDED.tax_withheld_amount, net_commission_amount = EXCLUDED.net_commission_amount,
    updated_at = now();

  -- Troca: mesma ordem da locacao.
  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount,
    tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, settings_row.id,
    'exchange', movement.id, movement.waste_residue_id, movement.occurred_on,
    ROUND(movement.removed_quantity * movement.exchange_rate, 2), settings_row.exchange_commission_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - settings_row.tax_withholding_rate / 100) * settings_row.exchange_commission_rate / 100, 2),
    settings_row.tax_withholding_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * settings_row.tax_withholding_rate / 100, 2),
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - settings_row.tax_withholding_rate / 100) * settings_row.exchange_commission_rate / 100, 2)
  FROM public.billing_v2_movements movement
  WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.removed_quantity > 0
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, waste_residue_id = EXCLUDED.waste_residue_id,
    execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount, commission_rate = EXCLUDED.commission_rate,
    gross_commission_amount = EXCLUDED.gross_commission_amount, tax_withholding_rate = EXCLUDED.tax_withholding_rate,
    tax_withheld_amount = EXCLUDED.tax_withheld_amount, net_commission_amount = EXCLUDED.net_commission_amount,
    updated_at = now();

  -- Tratamento: a retencao e aplicada somente sobre a parcela da Jacoby.
  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount,
    tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, settings_row.id,
    'treatment', movement.id, movement.waste_residue_id, movement.occurred_on,
    ROUND(movement.weight_kg * movement.treatment_rate, 2),
    COALESCE(rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - rate.outsourced_treatment_rate, 0)),
    ROUND(movement.weight_kg * COALESCE(rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - rate.outsourced_treatment_rate, 0)), 2),
    settings_row.tax_withholding_rate,
    ROUND(movement.weight_kg * COALESCE(rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - rate.outsourced_treatment_rate, 0)) * settings_row.tax_withholding_rate / 100, 2),
    ROUND(movement.weight_kg * COALESCE(rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - rate.outsourced_treatment_rate, 0)) * (1 - settings_row.tax_withholding_rate / 100), 2)
  FROM public.billing_v2_movements movement
  JOIN public.outsourced_treatment_commission_rates rate
    ON rate.commission_setting_id = settings_row.id AND rate.waste_residue_id = movement.waste_residue_id
  WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.weight_kg > 0
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, waste_residue_id = EXCLUDED.waste_residue_id,
    execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount, commission_rate = EXCLUDED.commission_rate,
    gross_commission_amount = EXCLUDED.gross_commission_amount, tax_withholding_rate = EXCLUDED.tax_withholding_rate,
    tax_withheld_amount = EXCLUDED.tax_withheld_amount, net_commission_amount = EXCLUDED.net_commission_amount,
    updated_at = now();

  DELETE FROM public.outsourced_movement_commissions entry
  WHERE entry.cycle_id = cycle_row.id
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_v2_placements placement WHERE entry.source_type = 'rental' AND placement.id = entry.source_id
      UNION ALL
      SELECT 1 FROM public.billing_v2_movements movement WHERE entry.source_type IN ('exchange', 'treatment') AND movement.id = entry.source_id AND movement.confirmed
    );
END;
$$;

-- Atualiza apenas ciclos que ja possuem uma regra ativa, preservando baixas e observacoes financeiras.
DO $$
DECLARE cycle_id UUID;
BEGIN
  FOR cycle_id IN
    SELECT cycle.id
    FROM public.billing_v2_cycles cycle
    JOIN public.outsourced_commission_settings setting
      ON setting.client_id = cycle.client_id
      AND setting.outsourced_company_id = cycle.outsourced_company_id
      AND setting.active
    WHERE cycle.status = 'closed' AND cycle.issuer_type = 'outsourced'
  LOOP
    PERFORM public.sync_outsourced_cycle_commissions(cycle_id);
  END LOOP;
END;
$$;
