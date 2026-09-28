-- Correção pontual: no BM #133 o valor informado era unitário (R$ 1.500),
-- portanto o total precisa respeitar a quantidade de 12 serviços.
UPDATE public.billing_v2_cycle_services AS service
SET
  unit_amount = service.amount,
  amount = service.amount * service.quantity
FROM public.billing_v2_cycles AS cycle
    , public.clients AS client
    , public.waste_services AS waste_service
WHERE service.cycle_id = cycle.id
  AND client.id = cycle.client_id
  AND waste_service.id = service.waste_service_id
  AND cycle.bulletin_number = 133
  AND client.name = 'Consórcio Baixada Santista - obras Sabesp'
  AND waste_service.name = 'DESCARTE LODO'
  AND service.quantity = 12
  AND service.amount = 1500;
