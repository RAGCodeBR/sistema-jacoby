-- Opção simples: uma notificação ao entrar no prazo ou avisos diários até regularizar.
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS notify_daily_until_resolved BOOLEAN NOT NULL DEFAULT true;

-- Documentos anteriores mantêm o comportamento diário que já possuíam.
UPDATE public.client_documents
SET notify_daily_until_resolved = true
WHERE notify_daily_until_resolved IS NULL;

CREATE OR REPLACE FUNCTION public.jacoby_generate_document_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc RECORD;
BEGIN
  FOR doc IN
    SELECT d.id, d.title, d.expires_at, c.name AS client_name
    FROM public.client_documents d
    JOIN public.clients c ON c.id = d.client_id
    WHERE d.active
      AND d.expires_at IS NOT NULL
      AND d.expires_at - CURRENT_DATE <= d.notify_days_before
      AND (
        d.last_notified_on IS NULL
        OR d.notify_daily_until_resolved
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    SELECT recipient.user_id, 'document_expiry',
      CASE WHEN doc.expires_at < CURRENT_DATE THEN 'Documento vencido' ELSE 'Pendência de documento' END,
      doc.title || ' — ' || doc.client_name || CASE
        WHEN doc.expires_at < CURRENT_DATE THEN ' está vencido desde ' || to_char(doc.expires_at, 'DD/MM/YYYY') || '.'
        WHEN doc.expires_at = CURRENT_DATE THEN ' vence hoje.'
        ELSE ' vence em ' || to_char(doc.expires_at, 'DD/MM/YYYY') || '.'
      END
    FROM (
      SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::public.app_role
      UNION
      SELECT up.user_id FROM public.user_permissions up WHERE 'documents' = ANY(up.permissions)
    ) AS recipient;

    UPDATE public.client_documents SET last_notified_on = CURRENT_DATE WHERE id = doc.id;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
