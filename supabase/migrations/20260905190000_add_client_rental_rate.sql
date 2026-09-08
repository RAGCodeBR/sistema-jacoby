-- A locação deixa de pertencer ao equipamento e passa a ser um valor fixo do cliente.
ALTER TABLE public.waste_client_billing_settings
  ADD COLUMN IF NOT EXISTS rental_rate NUMERIC NOT NULL DEFAULT 0 CHECK (rental_rate >= 0);

NOTIFY pgrst, 'reload schema';
