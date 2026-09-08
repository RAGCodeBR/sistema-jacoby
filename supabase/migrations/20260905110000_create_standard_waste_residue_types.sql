CREATE TABLE IF NOT EXISTS public.waste_residue_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  waste_class TEXT NOT NULL DEFAULT 'class_ii'
    CHECK (waste_class IN ('class_i', 'class_ii')),
  unit TEXT NOT NULL DEFAULT 'kg',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waste_residue_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Standard residue types can be read by authenticated users"
  ON public.waste_residue_types;
CREATE POLICY "Standard residue types can be read by authenticated users"
  ON public.waste_residue_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only admins manage standard residue types"
  ON public.waste_residue_types;
CREATE POLICY "Only admins manage standard residue types"
  ON public.waste_residue_types
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
