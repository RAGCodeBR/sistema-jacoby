-- Boletins anteriores ao recorte por filial já tinham a origem registrada nas
-- locações e movimentações. Preenchemos o pátio no boletim somente quando há
-- uma única origem inequívoca, sem adivinhar nem misturar pátios distintos.
WITH cycle_branches AS (
  SELECT
    cycle.id,
    array_agg(DISTINCT source.branch_id) FILTER (WHERE source.branch_id IS NOT NULL) AS branch_ids
  FROM public.billing_v2_cycles AS cycle
  LEFT JOIN LATERAL (
    SELECT placement.branch_id
    FROM public.billing_v2_placements AS placement
    WHERE placement.cycle_id = cycle.id
    UNION
    SELECT movement.branch_id
    FROM public.billing_v2_movements AS movement
    WHERE movement.cycle_id = cycle.id
  ) AS source ON true
  WHERE cycle.branch_id IS NULL
  GROUP BY cycle.id
)
UPDATE public.billing_v2_cycles AS cycle
SET branch_id = cycle_branches.branch_ids[1]
FROM cycle_branches
WHERE cycle.id = cycle_branches.id
  AND cardinality(cycle_branches.branch_ids) = 1;

NOTIFY pgrst, 'reload schema';
