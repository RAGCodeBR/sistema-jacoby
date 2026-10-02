-- Todo BM do cliente demonstrativo RAG, incluindo Matriz, Serra Negra, Dev
-- BNH e futuras filiais, pertence somente ao ambiente de teste.
UPDATE public.billing_v2_cycles AS cycle
SET is_demo = true
FROM public.clients AS client
WHERE client.id = cycle.client_id
  AND client.is_demo
  AND NOT cycle.is_demo;

CREATE OR REPLACE FUNCTION public.jacoby_sync_billing_cycle_demo_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_demo := EXISTS (
    SELECT 1
    FROM public.clients AS client
    WHERE client.id = NEW.client_id
      AND client.is_demo
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_billing_cycle_demo_flag ON public.billing_v2_cycles;
CREATE TRIGGER trg_sync_billing_cycle_demo_flag
  BEFORE INSERT OR UPDATE OF client_id ON public.billing_v2_cycles
  FOR EACH ROW EXECUTE FUNCTION public.jacoby_sync_billing_cycle_demo_flag();
