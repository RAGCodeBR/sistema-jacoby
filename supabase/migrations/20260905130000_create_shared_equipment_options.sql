-- Sugestões reutilizáveis, independentes do cliente que possui o equipamento.
CREATE TABLE IF NOT EXISTS public.waste_equipment_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_type TEXT NOT NULL CHECK (option_type IN ('vehicle_model', 'recipient')),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (option_type, name)
);

ALTER TABLE public.waste_equipment_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipment options can be read by authenticated users"
  ON public.waste_equipment_options;
CREATE POLICY "Equipment options can be read by authenticated users"
  ON public.waste_equipment_options
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only admins manage shared equipment options"
  ON public.waste_equipment_options;
CREATE POLICY "Only admins manage shared equipment options"
  ON public.waste_equipment_options
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Inclui os valores que já existem nos cadastros dos clientes como sugestões globais.
INSERT INTO public.waste_equipment_options (option_type, name)
SELECT 'vehicle_model', trim(name)
FROM public.waste_equipment
WHERE trim(name) <> ''
ON CONFLICT (option_type, name) DO NOTHING;

INSERT INTO public.waste_equipment_options (option_type, name)
SELECT 'recipient', trim(equipment_type)
FROM public.waste_equipment
WHERE trim(equipment_type) <> ''
ON CONFLICT (option_type, name) DO NOTHING;
