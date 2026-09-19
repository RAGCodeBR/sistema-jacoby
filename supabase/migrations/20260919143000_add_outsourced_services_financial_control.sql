-- O próprio serviço do BM é o registro financeiro. Isso evita duplicação e
-- mantém alterações de valor, cliente e boletim sempre sincronizadas.
ALTER TABLE public.billing_v2_cycle_services
  ADD COLUMN IF NOT EXISTS execution_date DATE,
  ADD COLUMN IF NOT EXISTS request_date DATE,
  ADD COLUMN IF NOT EXISTS equipment_description TEXT,
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS service_order TEXT,
  ADD COLUMN IF NOT EXISTS closing_date DATE,
  ADD COLUMN IF NOT EXISTS invoice_issued_on DATE,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_due_date DATE,
  ADD COLUMN IF NOT EXISTS net_invoice_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (commission_rate >= 0),
  ADD COLUMN IF NOT EXISTS commission_due_date DATE,
  ADD COLUMN IF NOT EXISTS certificate_number TEXT,
  ADD COLUMN IF NOT EXISTS certificate_expires_on DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'received')),
  ADD COLUMN IF NOT EXISTS received_on DATE,
  ADD COLUMN IF NOT EXISTS financial_notes TEXT;

CREATE INDEX IF NOT EXISTS billing_v2_cycle_services_financial_idx
  ON public.billing_v2_cycle_services (outsourced_company_id, execution_date)
  WHERE outsourced_company_id IS NOT NULL AND execution_date IS NOT NULL;

-- Ao trocar o emissor do BM, os serviços já incluídos passam a acompanhar a
-- empresa escolhida. Emissor Jacoby remove o serviço do controle terceirizado.
CREATE OR REPLACE FUNCTION public.sync_billing_services_issuer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.issuer_type = 'outsourced' THEN
    UPDATE public.billing_v2_cycle_services
    SET outsourced_company_id = NEW.outsourced_company_id
    WHERE cycle_id = NEW.id;
  ELSIF OLD.issuer_type IS DISTINCT FROM NEW.issuer_type
     OR OLD.outsourced_company_id IS NOT NULL THEN
    UPDATE public.billing_v2_cycle_services
    SET outsourced_company_id = NULL
    WHERE cycle_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_billing_services_issuer ON public.billing_v2_cycles;
CREATE TRIGGER trg_sync_billing_services_issuer
  AFTER UPDATE OF issuer_type, outsourced_company_id ON public.billing_v2_cycles
  FOR EACH ROW EXECUTE FUNCTION public.sync_billing_services_issuer();

NOTIFY pgrst, 'reload schema';
