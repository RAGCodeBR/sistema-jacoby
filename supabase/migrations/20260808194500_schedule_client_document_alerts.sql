-- Gera os avisos diariamente, mesmo quando nenhum administrador estiver com o sistema aberto.
CREATE OR REPLACE FUNCTION public.jacoby_generate_document_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc RECORD;
BEGIN
  FOR doc IN
    SELECT d.id, d.title, d.expires_at, c.name AS client_name
    FROM public.client_documents d
    JOIN public.clients c ON c.id = d.client_id
    WHERE d.active AND d.expires_at IS NOT NULL
      AND d.expires_at >= CURRENT_DATE
      AND d.expires_at - CURRENT_DATE <= d.notify_days_before
      AND d.last_notified_on IS DISTINCT FROM CURRENT_DATE
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    SELECT ur.user_id, 'document_expiry', 'Documento próximo do vencimento',
      doc.title || ' — ' || doc.client_name || ' vence em ' || to_char(doc.expires_at, 'DD/MM/YYYY') || '.'
    FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role;
    UPDATE public.client_documents SET last_notified_on = CURRENT_DATE WHERE id = doc.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.jacoby_generate_document_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.jacoby_generate_document_alerts() FROM authenticated;

CREATE OR REPLACE FUNCTION public.jacoby_process_document_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN; END IF;
  PERFORM public.jacoby_generate_document_alerts();
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'jacoby-document-alerts';
  PERFORM cron.schedule('jacoby-document-alerts', '0 8 * * *', 'SELECT public.jacoby_generate_document_alerts();');
END;
$$;
