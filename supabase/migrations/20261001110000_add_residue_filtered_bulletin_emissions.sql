-- Emissões filtradas por resíduo não encerram o boletim-base. Cada uma recebe
-- uma identificação derivada (por exemplo, #013.1 e #013.2) e pode ser
-- publicada no Portal do Cliente de forma independente.
CREATE TABLE IF NOT EXISTS public.billing_v2_residue_emissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE,
  waste_residue_id UUID NOT NULL REFERENCES public.waste_residues(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  display_number TEXT NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_portal_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, sequence),
  UNIQUE (display_number)
);

CREATE INDEX IF NOT EXISTS billing_v2_residue_emissions_cycle_idx
  ON public.billing_v2_residue_emissions (cycle_id, finalized_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_v2_residue_emissions TO authenticated;
ALTER TABLE public.billing_v2_residue_emissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_v2_residue_emissions_billing_manage
  ON public.billing_v2_residue_emissions FOR ALL TO authenticated
  USING (public.has_app_permission('billing'))
  WITH CHECK (public.has_app_permission('billing'));

CREATE POLICY jacoby_client_read_published_residue_bulletins
  ON public.billing_v2_residue_emissions FOR SELECT TO authenticated
  USING (
    client_portal_visible
    AND EXISTS (
      SELECT 1
      FROM public.billing_v2_cycles cycle
      JOIN public.client_user_links link ON link.client_id = cycle.client_id
      WHERE cycle.id = billing_v2_residue_emissions.cycle_id
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
