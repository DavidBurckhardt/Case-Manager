-- Migration 21: Agregar CADUCIDAD_INSTANCIA como act_type válido
--
-- case_deadlines.act_type no tiene check constraint (solo unique compuesto),
-- por lo que no hay DDL que modificar. Este archivo documenta el cambio.

comment on table public.case_deadlines is
  'Plazos procesales generados automáticamente por el motor de plazos a partir de procedural_acts. '
  'is_auto_generated=true → regenerable; estado=CUMPLIDO con is_auto_generated=false → intocable. '
  'act_type válidos: TRASLADO_DEMANDA, TRASLADO_RECONVENCION, APERTURA_PRUEBA, '
  'SENTENCIA_PRIMERA_INSTANCIA, EXPRESION_AGRAVIOS, INTIMACION_PAGO_ART_504, CADUCIDAD_INSTANCIA.';
