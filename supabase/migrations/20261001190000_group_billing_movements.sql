-- Uma troca múltipla continua registrando cada equipamento para preservar o
-- controle operacional, mas todas as linhas do mesmo lançamento recebem o
-- mesmo lote para serem exibidas e editadas como uma única movimentação.
ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS billing_v2_movements_batch_idx
  ON public.billing_v2_movements (cycle_id, batch_id)
  WHERE batch_id IS NOT NULL;
