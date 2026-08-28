-- Um documento pode pertencer à matriz (NULL) ou a uma filial/pátio específico.
-- Registros antigos continuam na matriz para não mudar a visibilidade existente.
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.client_branches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS client_documents_client_branch_expiry_idx
  ON public.client_documents (client_id, branch_id, expires_at);

NOTIFY pgrst, 'reload schema';
