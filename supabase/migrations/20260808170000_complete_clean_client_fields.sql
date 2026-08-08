-- The independent Jacoby project starts with no client records, but the
-- client interface expects these optional registration fields to exist.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS state_registration text,
  ADD COLUMN IF NOT EXISTS municipal_registration text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS responsible text,
  ADD COLUMN IF NOT EXISTS avatar_path text;

NOTIFY pgrst, 'reload schema';
