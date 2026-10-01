-- Comissionamento de locação, troca e tratamento executados por terceirizadas.
-- A configuração é opcional: nada é gerado até que a Juliana cadastre a regra.
CREATE TABLE IF NOT EXISTS public.outsourced_commission_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  outsourced_company_id UUID NOT NULL REFERENCES public.outsourced_companies(id) ON DELETE CASCADE,
  tax_withholding_rate NUMERIC(8,4) NOT NULL DEFAULT 11 CHECK (tax_withholding_rate >= 0 AND tax_withholding_rate <= 100),
  rental_commission_rate NUMERIC(8,4) NOT NULL DEFAULT 10 CHECK (rental_commission_rate >= 0 AND rental_commission_rate <= 100),
  exchange_commission_rate NUMERIC(8,4) NOT NULL DEFAULT 10 CHECK (exchange_commission_rate >= 0 AND exchange_commission_rate <= 100),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, outsourced_company_id)
);

CREATE TABLE IF NOT EXISTS public.outsourced_treatment_commission_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_setting_id UUID NOT NULL REFERENCES public.outsourced_commission_settings(id) ON DELETE CASCADE,
  waste_residue_id UUID NOT NULL REFERENCES public.waste_residues(id) ON DELETE CASCADE,
  outsourced_treatment_rate NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (outsourced_treatment_rate >= 0),
  jacoby_treatment_rate NUMERIC(14,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commission_setting_id, waste_residue_id),
  CHECK (jacoby_treatment_rate IS NULL OR jacoby_treatment_rate >= 0)
);

CREATE TABLE IF NOT EXISTS public.outsourced_movement_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  outsourced_company_id UUID NOT NULL REFERENCES public.outsourced_companies(id) ON DELETE RESTRICT,
  commission_setting_id UUID REFERENCES public.outsourced_commission_settings(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('rental', 'exchange', 'treatment')),
  source_id UUID NOT NULL,
  waste_residue_id UUID REFERENCES public.waste_residues(id) ON DELETE SET NULL,
  execution_date DATE,
  base_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(14,4) NOT NULL DEFAULT 0,
  gross_commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_withholding_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
  tax_withheld_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'received')),
  received_on DATE,
  financial_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS outsourced_movement_commissions_financial_idx
  ON public.outsourced_movement_commissions (outsourced_company_id, execution_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outsourced_commission_settings,
  public.outsourced_treatment_commission_rates, public.outsourced_movement_commissions TO authenticated;
ALTER TABLE public.outsourced_commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outsourced_treatment_commission_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outsourced_movement_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY outsourced_commission_settings_movement_settings_manage ON public.outsourced_commission_settings
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY outsourced_treatment_commission_rates_movement_settings_manage ON public.outsourced_treatment_commission_rates
  FOR ALL TO authenticated
  USING (public.has_app_permission('movement_settings'))
  WITH CHECK (public.has_app_permission('movement_settings'));
CREATE POLICY outsourced_movement_commissions_billing_manage ON public.outsourced_movement_commissions
  FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

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

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount,
    tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, settings_row.id,
    'rental', placement.id, placement.waste_residue_id, placement.started_on,
    ROUND(placement.quantity * placement.monthly_rental_rate, 2), settings_row.rental_commission_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * settings_row.rental_commission_rate / 100, 2),
    settings_row.tax_withholding_rate,
    ROUND(placement.quantity * placement.monthly_rental_rate * settings_row.rental_commission_rate / 100 * settings_row.tax_withholding_rate / 100, 2),
    ROUND(placement.quantity * placement.monthly_rental_rate * settings_row.rental_commission_rate / 100 * (1 - settings_row.tax_withholding_rate / 100), 2)
  FROM public.billing_v2_placements placement
  WHERE placement.cycle_id = cycle_row.id
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, waste_residue_id = EXCLUDED.waste_residue_id,
    execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount, commission_rate = EXCLUDED.commission_rate,
    gross_commission_amount = EXCLUDED.gross_commission_amount, tax_withholding_rate = EXCLUDED.tax_withholding_rate,
    tax_withheld_amount = EXCLUDED.tax_withheld_amount, net_commission_amount = EXCLUDED.net_commission_amount,
    updated_at = now();

  INSERT INTO public.outsourced_movement_commissions (
    cycle_id, client_id, outsourced_company_id, commission_setting_id, source_type, source_id,
    waste_residue_id, execution_date, base_amount, commission_rate, gross_commission_amount,
    tax_withholding_rate, tax_withheld_amount, net_commission_amount
  )
  SELECT cycle_row.id, cycle_row.client_id, cycle_row.outsourced_company_id, settings_row.id,
    'exchange', movement.id, movement.waste_residue_id, movement.occurred_on,
    ROUND(movement.removed_quantity * movement.exchange_rate, 2), settings_row.exchange_commission_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * settings_row.exchange_commission_rate / 100, 2),
    settings_row.tax_withholding_rate,
    ROUND(movement.removed_quantity * movement.exchange_rate * settings_row.exchange_commission_rate / 100 * settings_row.tax_withholding_rate / 100, 2),
    ROUND(movement.removed_quantity * movement.exchange_rate * settings_row.exchange_commission_rate / 100 * (1 - settings_row.tax_withholding_rate / 100), 2)
  FROM public.billing_v2_movements movement
  WHERE movement.cycle_id = cycle_row.id AND movement.confirmed AND movement.removed_quantity > 0
  ON CONFLICT (cycle_id, source_type, source_id) DO UPDATE SET
    commission_setting_id = EXCLUDED.commission_setting_id, waste_residue_id = EXCLUDED.waste_residue_id,
    execution_date = EXCLUDED.execution_date, base_amount = EXCLUDED.base_amount, commission_rate = EXCLUDED.commission_rate,
    gross_commission_amount = EXCLUDED.gross_commission_amount, tax_withholding_rate = EXCLUDED.tax_withholding_rate,
    tax_withheld_amount = EXCLUDED.tax_withheld_amount, net_commission_amount = EXCLUDED.net_commission_amount,
    updated_at = now();

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

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_cycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_outsourced_cycle_commissions(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_outsourced_cycle_commissions(COALESCE(NEW.cycle_id, OLD.cycle_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_placement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_outsourced_cycle_commissions(COALESCE(NEW.cycle_id, OLD.cycle_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commission_setting(target_setting_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE setting_client UUID; setting_company UUID; cycle_id UUID;
BEGIN
  SELECT client_id, outsourced_company_id INTO setting_client, setting_company FROM public.outsourced_commission_settings WHERE id = target_setting_id;
  IF NOT FOUND THEN RETURN; END IF;
  FOR cycle_id IN SELECT id FROM public.billing_v2_cycles WHERE client_id = setting_client AND outsourced_company_id = setting_company AND issuer_type = 'outsourced' AND status = 'closed' LOOP
    PERFORM public.sync_outsourced_cycle_commissions(cycle_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.outsourced_movement_commissions
    WHERE commission_setting_id = OLD.id;
  ELSE
    PERFORM public.sync_outsourced_commission_setting(NEW.id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_outsourced_commissions_from_treatment_rate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE setting_id UUID := COALESCE(NEW.commission_setting_id, OLD.commission_setting_id);
BEGIN
  PERFORM public.sync_outsourced_commission_setting(setting_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_cycle ON public.billing_v2_cycles;
CREATE TRIGGER trg_sync_outsourced_commissions_cycle AFTER INSERT OR UPDATE OR DELETE ON public.billing_v2_cycles
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_cycle();
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_movement ON public.billing_v2_movements;
CREATE TRIGGER trg_sync_outsourced_commissions_movement AFTER INSERT OR UPDATE OR DELETE ON public.billing_v2_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_movement();
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_placement ON public.billing_v2_placements;
CREATE TRIGGER trg_sync_outsourced_commissions_placement AFTER INSERT OR UPDATE OR DELETE ON public.billing_v2_placements
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_placement();
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_settings ON public.outsourced_commission_settings;
CREATE TRIGGER trg_sync_outsourced_commissions_settings AFTER INSERT OR UPDATE OR DELETE ON public.outsourced_commission_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_settings();
DROP TRIGGER IF EXISTS trg_sync_outsourced_commissions_treatment_rate ON public.outsourced_treatment_commission_rates;
CREATE TRIGGER trg_sync_outsourced_commissions_treatment_rate AFTER INSERT OR UPDATE OR DELETE ON public.outsourced_treatment_commission_rates
  FOR EACH ROW EXECUTE FUNCTION public.sync_outsourced_commissions_from_treatment_rate();

CREATE OR REPLACE FUNCTION public.jacoby_outsourced_commission_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER outsourced_commission_settings_updated_at BEFORE UPDATE ON public.outsourced_commission_settings
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_commission_updated_at();
CREATE TRIGGER outsourced_treatment_commission_rates_updated_at BEFORE UPDATE ON public.outsourced_treatment_commission_rates
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_commission_updated_at();
CREATE TRIGGER outsourced_movement_commissions_updated_at BEFORE UPDATE ON public.outsourced_movement_commissions
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_outsourced_commission_updated_at();

NOTIFY pgrst, 'reload schema';
