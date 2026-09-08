-- Equipamentos iguais podem ser cadastrados para o mesmo cliente.
-- A deduplicação é feita apenas nas opções globais de seleção.
DROP TRIGGER IF EXISTS prevent_duplicate_waste_equipment_name ON public.waste_equipment;
DROP FUNCTION IF EXISTS public.prevent_duplicate_waste_equipment_name();
