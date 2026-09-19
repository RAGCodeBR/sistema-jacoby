-- Um único PDF de faturamento pertence ao serviço do BM e é reutilizado no Financeiro.
ALTER TABLE public.billing_v2_cycle_services
  ADD COLUMN IF NOT EXISTS invoice_pdf_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT;

NOTIFY pgrst, 'reload schema';
