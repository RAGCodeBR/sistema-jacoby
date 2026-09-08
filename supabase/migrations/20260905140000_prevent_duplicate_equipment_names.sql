-- Um cliente não pode cadastrar o mesmo veículo/modelo duas vezes.
-- A regra é feita por trigger para também proteger inserções fora da interface.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_waste_equipment_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.waste_equipment equipment
    WHERE equipment.client_id = NEW.client_id
      AND lower(trim(equipment.name)) = lower(trim(NEW.name))
      AND equipment.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe um equipamento com este veículo/modelo para este cliente.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_duplicate_waste_equipment_name ON public.waste_equipment;
CREATE TRIGGER prevent_duplicate_waste_equipment_name
  BEFORE INSERT OR UPDATE OF client_id, name ON public.waste_equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_waste_equipment_name();
