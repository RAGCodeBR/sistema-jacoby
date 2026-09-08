-- A capacidade deixa de ser exclusiva de m³ e passa a respeitar a unidade escolhida.
ALTER TABLE public.waste_equipment
  ADD COLUMN IF NOT EXISTS capacity_value NUMERIC;

-- Preserva os cadastros existentes em m³ como ponto de partida para a nova estrutura.
UPDATE public.waste_equipment
SET capacity_value = capacity_m3,
    capacity_unit = 'm3'
WHERE capacity_value IS NULL
  AND capacity_m3 IS NOT NULL;
