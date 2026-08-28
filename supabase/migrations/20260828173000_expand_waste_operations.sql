-- Catálogo de serviços e referências operacionais por filial/pátio e caçamba.
CREATE TABLE IF NOT EXISTS public.waste_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_rate NUMERIC NOT NULL DEFAULT 0 CHECK (default_rate >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS public.waste_report_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.waste_reports(id) ON DELETE CASCADE,
  waste_service_id UUID NOT NULL REFERENCES public.waste_services(id) ON DELETE RESTRICT,
  rate NUMERIC NOT NULL DEFAULT 0 CHECK (rate >= 0),
  excluded BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (report_id, waste_service_id)
);

ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS capacity_unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'outro';

ALTER TABLE public.waste_movements
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES public.waste_equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS waste_services_client_idx ON public.waste_services (client_id, active);
CREATE INDEX IF NOT EXISTS waste_report_services_report_idx ON public.waste_report_services (report_id);
CREATE INDEX IF NOT EXISTS waste_movements_branch_equipment_idx ON public.waste_movements (branch_id, equipment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waste_services, public.waste_report_services TO authenticated;
ALTER TABLE public.waste_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_report_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waste_services_admin_manage ON public.waste_services;
CREATE POLICY waste_services_admin_manage ON public.waste_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_services_client_read ON public.waste_services;
CREATE POLICY waste_services_client_read ON public.waste_services FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_user_links l WHERE l.client_id = waste_services.client_id AND l.user_id = auth.uid())
);

DROP POLICY IF EXISTS waste_report_services_admin_manage ON public.waste_report_services;
CREATE POLICY waste_report_services_admin_manage ON public.waste_report_services FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS waste_report_services_client_read ON public.waste_report_services;
CREATE POLICY waste_report_services_client_read ON public.waste_report_services FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.waste_reports r JOIN public.client_user_links l ON l.client_id = r.client_id WHERE r.id = waste_report_services.report_id AND r.status = 'published' AND l.user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
