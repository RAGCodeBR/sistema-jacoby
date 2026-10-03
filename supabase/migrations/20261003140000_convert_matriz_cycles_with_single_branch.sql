-- Data fix: some bulletins were opened as matriz (branch_id null) and then had
-- placements/movements registered under a real filial (e.g. BM #179 → SIGMA/ALEMOA),
-- because the branch lock was not enforced before. A bulletin belongs to a single
-- branch, so convert any matriz cycle whose placements/movements all point to ONE
-- distinct filial into that filial. Cycles that mix multiple branches (ambiguous)
-- are left untouched. No rows are deleted; only the cycle's branch_id is set.

UPDATE public.billing_v2_cycles AS c
SET branch_id = sub.branch_id
FROM (
  SELECT cycle_id, (array_agg(DISTINCT branch_id))[1] AS branch_id
  FROM (
    SELECT cycle_id, branch_id FROM public.billing_v2_placements WHERE branch_id IS NOT NULL
    UNION ALL
    SELECT cycle_id, branch_id FROM public.billing_v2_movements WHERE branch_id IS NOT NULL
  ) x
  GROUP BY cycle_id
  HAVING COUNT(DISTINCT branch_id) = 1
) AS sub
WHERE c.id = sub.cycle_id
  AND c.branch_id IS NULL;
