-- Modelo reutilizavel por terceirizada. Uma regra por cliente continua tendo
-- prioridade, mas a LDJ Ambiental passa a ter uma base pronta e editavel.
CREATE TABLE IF NOT EXISTS public.outsourced_commission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outsourced_company_id UUID NOT NULL UNIQUE REFERENCES public.outsourced_companies(id) ON DELETE CASCADE,
  tax_withholding_rate NUMERIC(8,4) NOT NULL DEFAULT 11 CHECK (tax_withholding_rate >= 0 AND tax_withholding_rate <= 100),
  rental_commission_rate NUMERIC(8,4) NOT NULL DEFAULT 10 CHECK (rental_commission_rate >= 0 AND rental_commission_rate <= 100),
  exchange_commission_rate NUMERIC(8,4) NOT NULL DEFAULT 10 CHECK (exchange_commission_rate >= 0 AND exchange_commission_rate <= 100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outsourced_treatment_commission_template_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_template_id UUID NOT NULL REFERENCES public.outsourced_commission_templates(id) ON DELETE CASCADE,
  residue_name TEXT NOT NULL,
  outsourced_treatment_rate NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (outsourced_treatment_rate >= 0),
  jacoby_treatment_rate NUMERIC(14,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commission_template_id, residue_name),
  CHECK (jacoby_treatment_rate IS NULL OR jacoby_treatment_rate >= 0)
);

ALTER TABLE public.outsourced_movement_commissions
  ADD COLUMN IF NOT EXISTS commission_template_id UUID REFERENCES public.outsourced_commission_templates(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outsourced_commission_templates,
  public.outsourced_treatment_commission_template_rates TO authenticated;
ALTER TABLE public.outsourced_commission_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outsourced_treatment_commission_template_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY outsourced_commission_templates_movement_settings_manage ON public.outsourced_commission_templates
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY outsourced_treatment_commission_template_rates_movement_settings_manage ON public.outsourced_treatment_commission_template_rates
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));

-- Valores-base da planilha LDJ. Podem ser ajustados depois na tela de comissionamento.
INSERT INTO public.outsourced_commission_templates (
  outsourced_company_id, tax_withholding_rate, rental_commission_rate, exchange_commission_rate, active
)
SELECT id, 11, 10, 10, true
FROM public.outsourced_companies
WHERE COALESCE(trade_name, '') ILIKE '%LDJ%' OR legal_name ILIKE '%LDJ%'
ON CONFLICT (outsourced_company_id) DO NOTHING;

INSERT INTO public.outsourced_treatment_commission_template_rates (
  commission_template_id, residue_name, outsourced_treatment_rate, jacoby_treatment_rate
)
SELECT template.id, rate.residue_name, rate.outsourced_treatment_rate, rate.jacoby_treatment_rate
FROM public.outsourced_commission_templates template
JOIN public.outsourced_companies company ON company.id = template.outsourced_company_id
CROSS JOIN (VALUES
  ('LIXO', 0.30::NUMERIC, 0.05::NUMERIC),
  ('MIX', 1.07::NUMERIC, 0.37::NUMERIC),
  ('MIX SÓLIDOS', 1.07::NUMERIC, 0.37::NUMERIC),
  ('TELHAS DE AMIANTO', 1.07::NUMERIC, 0.37::NUMERIC)
) AS rate(residue_name, outsourced_treatment_rate, jacoby_treatment_rate)
WHERE COALESCE(company.trade_name, '') ILIKE '%LDJ%' OR company.legal_name ILIKE '%LDJ%'
ON CONFLICT (commission_template_id, residue_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_outsourced_cycle_commissions(target_cycle_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cycle_row public.billing_v2_cycles%ROWTYPE;
  setting_row public.outsourced_commission_settings%ROWTYPE;
  template_row public.outsourced_commission_templates%ROWTYPE;
  setting_id UUID;
  template_id UUID;
  tax_rate NUMERIC;
  rental_rate NUMERIC;
  exchange_rate NUMERIC;
BEGIN
  SELECT * INTO cycle_row FROM public.billing_v2_cycles WHERE id = target_cycle_id;
  IF NOT FOUND OR cycle_row.status <> 'closed' OR cycle_row.issuer_type <> 'outsourced' OR cycle_row.outsourced_company_id IS NULL THEN
    DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
    RETURN;
  END IF;

  SELECT * INTO setting_row FROM public.outsourced_commission_settings
  WHERE client_id = cycle_row.client_id AND outsourced_company_id = cycle_row.outsourced_company_id AND active LIMIT 1;
  IF FOUND THEN
    setting_id := setting_row.id; template_id := NULL; tax_rate := setting_row.tax_withholding_rate;
    rental_rate := setting_row.rental_commission_rate; exchange_rate := setting_row.exchange_commission_rate;
  ELSE
    SELECT * INTO template_row FROM public.outsourced_commission_templates
    WHERE outsourced_company_id = cycle_row.outsourced_company_id AND active LIMIT 1;
    IF NOT FOUND THEN
      DELETE FROM public.outsourced_movement_commissions WHERE cycle_id = target_cycle_id;
      RETURN;
    END IF;
    setting_id := NULL; template_id := template_row.id; tax_rate := template_row.tax_withholding_rate;
    rental_rate := template_row.rental_commission_rate; exchange_rate := template_row.exchange_commission_rate;
  END IF;

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'rental', placement.id,
    placement.waste_residue_id, placement.started_on, ROUND(placement.quantity * placement.monthly_rental_rate, 2), rental_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - tax_rate / 100) * rental_rate / 100, 2), tax_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * tax_rate / 100, 2),
    ROUND(placement.quantity * placement.monthly_rental_rate * (1 - tax_rate / 100) * rental_rate / 100, 2)
  FROM public.billing_v2_placements placement WHERE placement.cycle_id = cycle_row.id
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'exchange', movement.id,
    movement.waste_residue_id, movement.occurred_on, ROUND(movement.removed_quantity * movement.exchange_rate, 2), exchange_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - tax_rate / 100) * exchange_rate / 100, 2), tax_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * tax_rate / 100, 2),
    ROUND(movement.removed_quantity * movement.exchange_rate * (1 - tax_rate / 100) * exchange_rate / 100, 2)
  FROM public.billing_v2_movements movement WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.removed_quantity > 0
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, commission_template_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount, tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, setting_id, template_id, 'treatment', movement.id,
    movement.waste_residue_id, movement.occurred_on, ROUND(movement.weight_kg * movement.treatment_rate, 2),
    COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)),
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)), 2),
    tax_rate,
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)) * tax_rate / 100, 2),
    ROUND(movement.weight_kg * COALESCE(client_rate.jacoby_treatment_rate, template_rate.jacoby_treatment_rate, GREATEST(movement.treatment_rate - COALESCE(client_rate.outsourced_treatment_rate, template_rate.outsourced_treatment_rate), 0)) * (1 - tax_rate / 100), 2)
  FROM public.billing_v2_movements movement
  JOIN public.waste_residues residue ON residue.id = movement.waste_residue_id
  LEFT JOIN public.outsourced_treatment_commission_rates client_rate ON client_rate.commission_setting_id = setting_id AND client_rate.waste_residue_id = movement.waste_residue_id
  LEFT JOIN public.outsourced_treatment_commission_template_rates template_rate ON template_rate.commission_template_id = template_id AND lower(template_rate.residue_name) = lower(residue.name)
  WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.weight_kg > 0
    AND (client_rate.id IS NOT NULL OR template_rate.id IS NOT NULL)
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, commission_template_id = EXCLUDED.commission_template_id,
    waste_residue_id = EXCLUDED.waste_residue_id, execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount,
    commission_rate = EXCLUDED.commission_rate, gross_commission_amount = EXCLUDED.gross_commission_amount,
    tax_withholding_rate = EXCLUDED.tax_withholding_rate, tax_withheld_amount = EXCLUDED.tax_withheld_amount,
    net_commission_amount = EXCLUDED.net_commission_amount, updated_at = now();

  DELETE FROM public.outsourced_movement_commissions entry
  WHERE entry.cycle_id = cycle_row.id AND NOT EXISTS (
    SELECT 1 FROM public.billing_v2_placements placement WHERE entry.source_type = 'rental' AND placement.id = entry.source_id
    UNION ALL
    SELECT 1 FROM public.billing_v2_movements movement WHERE entry.source_type = 'exchange' AND movement.id = entry.source_id AND movement.confirmed
    UNION ALL
    SELECT 1 FROM public.billing_v2_movements movement
    JOIN public.waste_residues residue ON residue.id = movement.waste_residue_id
    LEFT JOIN public.outsourced_treatment_commission_rates client_rate ON client_rate.commission_setting_id = setting_id AND client_rate.waste_residue_id = movement.waste_residue_id
    LEFT JOIN public.outsourced_treatment_commission_template_rates template_rate ON template_rate.commission_template_id = template_id AND lower(template_rate.residue_name) = lower(residue.name)
    WHERE entry.source_type = 'treatment' AND movement.id = entry.source_id AND movement.confirmed
      AND (client_rate.id IS NOT NULL OR template_rate.id IS NOT NULL)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_template()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE company_id UUID := COALESCE(NEW.outsourced_company_id, OLD.outsourced_company_id); cycle_id UUID;
BEGIN
  FOR cycle_id IN SELECT id FROM public.billing_v2_cycles WHERE outsourced_company_id = company_id AND issuer_type = 'outsourced' AND status = 'closed' LOOP
    PERFORM public.sync_outsourced_cycle_commissions(cycle_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_template_rate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE template_id UUID := COALESCE(NEW.commission_template_id, OLD.commission_template_id); company_id UUID; cycle_id UUID;
BEGIN
  SELECT outsourced_company_id INTO company_id FROM public.outsourced_commission_templates WHERE id = template_id;
  FOR cycle_id IN SELECT id FROM public.billing_v2_cycles WHERE outsourced_company_id = company_id AND issuer_type = 'outsourced' AND status = 'closed' LOOP
    PERFORM public.sync_outsourced_cycle_commissions(cycle_id);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_template ON public.outsourced_commission_templates;
CREATE TRIGGER trg_sync_outsourced_commissions_template AFTER INSERT OR UPDATE OR DELETE ON public.outsourced_commission_templates
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_template();
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_template_rate ON public.outsourced_treatment_commission_template_rates;
CREATE TRIGGER trg_sync_outsourced_commissions_template_rate AFTER INSERT OR UPDATE OR DELETE ON public.outsourced_treatment_commission_template_rates
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_template_rate();

CREATE TRIGGER outsourced_commission_templates_updated_at BEFORE UPDATE ON public.outsourced_commission_templates
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_commission_updated_at();
CREATE TRIGGER outsourced_treatment_commission_template_rates_updated_at BEFORE UPDATE ON public.outsourced_treatment_commission_template_rates
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_commission_updated_at();

NOTIFY pgrst, 'reload schema';
