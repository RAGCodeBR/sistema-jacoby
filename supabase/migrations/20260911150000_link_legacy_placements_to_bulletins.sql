-- As locações criadas antes do vínculo por boletim continuam preservadas.
-- Quando a data de início cair dentro de um boletim do mesmo cliente, elas
-- passam a pertencer a ele para que o histórico e o valor apareçam juntos.
WITH placement_cycles AS (
  SELECT
    placement.id,
    (
      SELECT cycle.id
      FROM public.billing_v2_cycles AS cycle
      WHERE cycle.client_id = placement.client_id
        AND placement.started_on BETWEEN cycle.period_start AND cycle.period_end
      ORDER BY cycle.period_start DESC, cycle.created_at DESC
      LIMIT 1
    ) AS cycle_id
  FROM public.billing_v2_placements AS placement
  WHERE placement.cycle_id IS NULL
)
UPDATE public.billing_v2_placements AS placement
SET cycle_id = placement_cycles.cycle_id
FROM placement_cycles
WHERE placement.id = placement_cycles.id
  AND placement_cycles.cycle_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
