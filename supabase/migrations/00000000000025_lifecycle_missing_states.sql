-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 25: dos estados que faltaban en el grafo de la migración 24
--
--   CONTESTADO           — entre EN_TRASLADO y PRUEBA. El traslado corriendo y
--                          la demanda ya contestada son situaciones procesales
--                          distintas: en la primera el plazo del art. 356 sigue
--                          corriendo, en la segunda ya se consumió.
--   AUTOS_PARA_SENTENCIA — entre ALEGATOS y SENTENCIA_1. La causa cerrada y en
--                          despacho no es lo mismo que la sentencia dictada.
--
-- Los sort_order (45 y 65) caen en los huecos que la migración 24 dejó a
-- propósito entre los estados vecinos, así que el orden del catálogo sale
-- correcto sin renumerar nada.
--
-- Solo se AGREGAN aristas. La transición directa ('PRUEBA', 'ALEGATOS') queda
-- en su lugar: si el flujo correcto siempre pasa por AUTOS_PARA_SENTENCIA hay
-- que confirmarlo con el abogado antes de sacarla, y mientras tanto quitarla
-- rompería expedientes en curso.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.workflow_states (code, label, description, sort_order, is_terminal) values
  ('CONTESTADO',          'Contestado',              'Demanda contestada por el demandado',       45, false),
  ('AUTOS_PARA_SENTENCIA','Autos para sentencia',    'Causa cerrada, en despacho para sentencia', 65, false)
on conflict (code) do nothing;

insert into public.workflow_allowed_transitions (from_state_code, to_state_code) values
  ('EN_TRASLADO',          'CONTESTADO'),
  ('CONTESTADO',           'PRUEBA'),
  ('PRUEBA',               'AUTOS_PARA_SENTENCIA'),
  ('ALEGATOS',             'AUTOS_PARA_SENTENCIA'),
  ('AUTOS_PARA_SENTENCIA', 'SENTENCIA_1'),
  -- Misma regla que en la migración 24: la caducidad se puede declarar desde
  -- cualquier estado con la instancia abierta.
  ('CONTESTADO',           'CADUCIDAD')
on conflict do nothing;
