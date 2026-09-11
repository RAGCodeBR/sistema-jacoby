-- Cada boletim passa a ser um ciclo independente: não depende mais da competência mensal.
-- A numeração é global e permanente, para que uma reimpressão mantenha o mesmo número.
CREATE SEQUENCE IF NOT EXISTS public.billing_v2_bulletin_number_seq START WITH 1;

ALTER TABLE public.billing_v2_cycles
  DROP CONSTRAINT IF EXISTS billing_v2_cycles_client_id_period_start_key,
  ADD COLUMN IF NOT EXISTS bulletin_number BIGINT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

ALTER TABLE public.billing_v2_cycles
  ALTER COLUMN bulletin_number SET DEFAULT nextval('public.billing_v2_bulletin_number_seq');

UPDATE public.billing_v2_cycles
SET bulletin_number = nextval('public.billing_v2_bulletin_number_seq')
WHERE bulletin_number IS NULL;

ALTER TABLE public.billing_v2_cycles
  ALTER COLUMN bulletin_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_v2_cycles_bulletin_number_key
  ON public.billing_v2_cycles (bulletin_number);

SELECT setval(
  'public.billing_v2_bulletin_number_seq',
  COALESCE((SELECT MAX(bulletin_number) FROM public.billing_v2_cycles), 1),
  EXISTS (SELECT 1 FROM public.billing_v2_cycles)
);

-- Locações novas pertencem ao boletim que as originou. Registros antigos são preservados.
ALTER TABLE public.billing_v2_placements
  ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES public.billing_v2_cycles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS billing_v2_placements_cycle_idx
  ON public.billing_v2_placements (cycle_id, branch_id, started_on);

NOTIFY pgrst, 'reload schema';
