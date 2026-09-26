-- O PDF exibido no portal é gerado somente com dados operacionais do BM
-- publicado: datas, resíduos, OS e peso. Nenhum campo comercial é liberado.
DROP POLICY IF EXISTS jacoby_client_read_published_bulletin_movements ON public.billing_v2_movements;
CREATE POLICY jacoby_client_read_published_bulletin_movements ON public.billing_v2_movements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.billing_v2_cycles cycle
      JOIN public.client_user_links link ON link.client_id = cycle.client_id
      WHERE cycle.id = billing_v2_movements.cycle_id
        AND cycle.status = 'closed'
        AND cycle.client_portal_visible
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
