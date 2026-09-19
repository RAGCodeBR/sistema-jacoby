-- Número do Manifesto de Transporte de Resíduos vinculado ao lançamento operacional.
ALTER TABLE public.billing_v2_movements
  ADD COLUMN IF NOT EXISTS mtr_number TEXT;

NOTIFY pgrst, 'reload schema';
