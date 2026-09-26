-- O cliente pode consultar o demonstrativo completo somente quando o BM
-- estiver fechado e explicitamente publicado no seu portal.
DROP POLICY IF EXISTS jacoby_client_read_published_bulletin_placements ON public.billing_v2_placements;
CREATE POLICY jacoby_client_read_published_bulletin_placements ON public.billing_v2_placements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.billing_v2_cycles cycle
      JOIN public.client_user_links link ON link.client_id = cycle.client_id
      WHERE cycle.id = billing_v2_placements.cycle_id
        AND cycle.status = 'closed'
        AND cycle.client_portal_visible
        AND link.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
