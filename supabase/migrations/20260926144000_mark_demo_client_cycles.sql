-- Uma competência demonstrativa pode ficar sem movimento após ajustes no
-- histórico. Ainda assim, ela não deve reaparecer na lista global recente.
UPDATE public.billing_v2_cycles AS cycle
SET is_demo = true
WHERE cycle.client_id IN (
  SELECT DISTINCT source_cycle.client_id
  FROM public.billing_v2_cycles AS source_cycle
  JOIN public.billing_v2_movements AS movement ON movement.cycle_id = source_cycle.id
  WHERE movement.service_order LIKE 'DEMO-RAG-%'
);
