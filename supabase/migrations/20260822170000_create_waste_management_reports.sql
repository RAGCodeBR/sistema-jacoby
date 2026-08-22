-- Gestão de Resíduos: replaces the linked Excel tabs with a relational report.
-- A report owns movement rows, billing rates, MTR declarations and weighing tickets.
CREATE TABLE IF NOT EXISTS public.waste_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  responsible TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.waste_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  waste_category TEXT NOT NULL CHECK (waste_category IN ('class_ii_a', 'entulho', 'madeira', 'reciclaveis', 'class_i_mix', 'borra_oleosa')),
  occurred_on DATE NOT NULL,
  service_order TEXT,
  placed_quantity NUMERIC NOT NULL DEFAULT 0,
  placed_container_type TEXT,
  placed_container_number TEXT,
  removed_quantity NUMERIC NOT NULL DEFAULT 0,
  removed_container_type TEXT,
  removed_container_number TEXT,
  weight_kg NUMERIC NOT NULL DEFAULT 0,
  mtr_number TEXT,
  destination_name TEXT,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.waste_billing_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  waste_category TEXT NOT NULL CHECK (waste_category IN ('class_ii_a', 'entulho', 'madeira', 'reciclaveis', 'class_i_mix', 'borra_oleosa')),
  rental_rate NUMERIC NOT NULL DEFAULT 0,
  exchange_rate NUMERIC NOT NULL DEFAULT 0,
  treatment_rate NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (report_id, waste_category)
);

CREATE TABLE IF NOT EXISTS public.waste_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  waste_class TEXT NOT NULL CHECK (waste_class IN ('class_i', 'class_ii')),
  mtr_numbers TEXT,
  transporter_name TEXT,
  destination_name TEXT,
  declaration_text TEXT,
  issued_on DATE,
  UNIQUE (report_id, waste_class)
);

CREATE TABLE IF NOT EXISTS public.waste_weighing_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  waste_category TEXT NOT NULL CHECK (waste_category IN ('class_ii_a', 'entulho', 'madeira', 'reciclaveis', 'class_i_mix', 'borra_oleosa')),
  ticket_number TEXT,
  weighed_on DATE,
  vehicle_plate TEXT,
  gross_weight_kg NUMERIC,
  tare_weight_kg NUMERIC,
  net_weight_kg NUMERIC,
  file_name TEXT,
  storage_path TEXT,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waste_reports_client_period_idx ON public.waste_reports (client_id, period_start DESC);
CREATE INDEX IF NOT EXISTS waste_movements_report_category_idx ON public.waste_movements (report_id, waste_category, occurred_on);
CREATE INDEX IF NOT EXISTS waste_tickets_report_idx ON public.waste_weighing_tickets (report_id);

CREATE OR REPLACE FUNCTION public.jacoby_waste_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS jacoby_waste_reports_updated_at ON public.waste_reports;
CREATE TRIGGER jacoby_waste_reports_updated_at BEFORE UPDATE ON public.waste_reports FOR EACH ROW EXECUTE FUNCTION public.jacoby_waste_updated_at();
DROP TRIGGER IF EXISTS jacoby_waste_movements_updated_at ON public.waste_movements;
CREATE TRIGGER jacoby_waste_movements_updated_at BEFORE UPDATE ON public.waste_movements FOR EACH ROW EXECUTE FUNCTION public.jacoby_waste_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_reports, public.waste_movements, public.waste_billing_rates, public.waste_declarations, public.waste_weighing_tickets TO authenticated;
ALTER TABLE public.waste_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_billing_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_weighing_tickets ENABLE ROW LEVEL SECURITY;

-- Administrators own the operational workflow. A client can only read reports
-- explicitly published for the linked company, never drafts or another client.
DROP POLICY IF EXISTS waste_reports_admin_manage ON public.waste_reports;
CREATE POLICY waste_reports_admin_manage ON public.waste_reports FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_reports_client_read ON public.waste_reports;
CREATE POLICY waste_reports_client_read ON public.waste_reports FOR SELECT TO authenticated USING (status = 'published' AND EXISTS (SELECT 1 FROM public.client_user_links l WHERE l.client_id = waste_reports.client_id AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS waste_movements_admin_manage ON public.waste_movements;
CREATE POLICY waste_movements_admin_manage ON public.waste_movements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_movements_client_read ON public.waste_movements;
CREATE POLICY waste_movements_client_read ON public.waste_movements FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.waste_reports r JOIN public.client_user_links l ON l.client_id = r.client_id WHERE r.id = waste_movements.report_id AND r.status = 'published' AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS waste_rates_admin_manage ON public.waste_billing_rates;
CREATE POLICY waste_rates_admin_manage ON public.waste_billing_rates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_rates_client_read ON public.waste_billing_rates;
CREATE POLICY waste_rates_client_read ON public.waste_billing_rates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.waste_reports r JOIN public.client_user_links l ON l.client_id = r.client_id WHERE r.id = waste_billing_rates.report_id AND r.status = 'published' AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS waste_declarations_admin_manage ON public.waste_declarations;
CREATE POLICY waste_declarations_admin_manage ON public.waste_declarations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_declarations_client_read ON public.waste_declarations;
CREATE POLICY waste_declarations_client_read ON public.waste_declarations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.waste_reports r JOIN public.client_user_links l ON l.client_id = r.client_id WHERE r.id = waste_declarations.report_id AND r.status = 'published' AND l.user_id = auth.uid()));

DROP POLICY IF EXISTS waste_tickets_admin_manage ON public.waste_weighing_tickets;
CREATE POLICY waste_tickets_admin_manage ON public.waste_weighing_tickets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_tickets_client_read ON public.waste_weighing_tickets;
CREATE POLICY waste_tickets_client_read ON public.waste_weighing_tickets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.waste_reports r JOIN public.client_user_links l ON l.client_id = r.client_id WHERE r.id = waste_weighing_tickets.report_id AND r.status = 'published' AND l.user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
