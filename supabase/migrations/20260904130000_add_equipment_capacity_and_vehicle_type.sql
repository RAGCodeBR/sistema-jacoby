-- Dados operacionais usados pela locação e colocação de caçambas.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS capacity_m3 NUMERIC,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
