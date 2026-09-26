-- Boletins de demonstração não devem ocupar a lista operacional global.
-- Eles continuam disponíveis ao abrir o cliente demonstrativo diretamente.
ALTER TABLE public.billing_v2_cycles
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS billing_v2_cycles_recent_operational_idx
  ON public.billing_v2_cycles (is_demo, created_at DESC);

UPDATE public.billing_v2_cycles AS cycle
SET is_demo = true
WHERE EXISTS (
  SELECT 1
  FROM public.billing_v2_movements AS movement
  WHERE movement.cycle_id = cycle.id
    AND movement.service_order LIKE 'DEMO-RAG-%'
);

NOTIFY pgrst, 'reload schema';
