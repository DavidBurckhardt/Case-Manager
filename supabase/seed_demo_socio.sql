-- ─────────────────────────────────────────────────────────────────────────────
-- seed_demo_socio.sql — Set de expedientes demo para el usuario SOCIO de prueba
--
-- NO es una migración. Es un script de siembra que se corre a mano contra la
-- base de desarrollo para que alguien pueda recorrer la app con datos que
-- ejercitan cada caso de uso: plazo vencido, plazo urgente, plazo cumplido,
-- expediente en ejecución con historial completo, caducidad pasiva y un caso
-- terminal por acuerdo.
--
-- Requiere que el usuario socio.demo@brainlab.test ya exista (ver README abajo).
--
-- Uso:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed_demo_socio.sql
--
-- Para revertir todo lo que siembra este script:
--   delete from public.case_files
--    where created_by = (select id from public.users
--                         where email = 'socio.demo@brainlab.test');
--   (case_deadlines, workflow_transitions y las tablas satélite caen por
--    `on delete cascade`.)
--
-- IDEMPOTENCIA — cómo funciona
--   Los expedientes se insertan con `on conflict do nothing`, así que sus ids
--   sobreviven entre corridas y cualquier documento que hayas subido a mano
--   sigue colgando del mismo expediente.
--   Los plazos, transiciones y tablas satélite, en cambio, se BORRAN Y SE
--   REESCRIBEN en cada corrida. Tienen que hacerlo: todas sus fechas son
--   relativas a CURRENT_DATE, y si no se recalculan, el "plazo vencido hace
--   2 días" deja de estar vencido hace 2 días la semana que viene. El borrado
--   está acotado a los 6 case_number de la demo y nunca toca otros expedientes.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- Descomentar para probar el script sin persistir nada:
-- rollback;

do $$
declare
  v_user   uuid;
  v_email  text := 'socio.demo@brainlab.test';

  -- estados
  s_iniciado    uuid; s_admitido   uuid; s_notificando uuid; s_traslado uuid;
  s_contestado  uuid; s_prueba     uuid; s_alegatos    uuid; s_autos    uuid;
  s_sentencia   uuid; s_ejecucion  uuid; s_acuerdo     uuid;

  -- expedientes
  c_vencido uuid; c_urgente uuid; c_aldia uuid;
  c_ejec    uuid; c_caduc   uuid; c_cerrado uuid;

  -- fechas auxiliares
  d_inicio date;
begin

  -- ── 0. Precondiciones ──────────────────────────────────────────────────────

  select id into v_user from public.users where email = v_email;
  if v_user is null then
    raise exception
      'No existe el usuario %. Creá primero el usuario de Auth (ver TESTING_GUIDE.md).', v_email;
  end if;

  select id into s_iniciado   from public.workflow_states where code = 'INICIADO';
  select id into s_admitido   from public.workflow_states where code = 'ADMITIDO';
  select id into s_notificando from public.workflow_states where code = 'NOTIFICANDO';
  select id into s_traslado   from public.workflow_states where code = 'EN_TRASLADO';
  select id into s_contestado from public.workflow_states where code = 'CONTESTADO';
  select id into s_prueba     from public.workflow_states where code = 'PRUEBA';
  select id into s_alegatos   from public.workflow_states where code = 'ALEGATOS';
  select id into s_autos      from public.workflow_states where code = 'AUTOS_PARA_SENTENCIA';
  select id into s_sentencia  from public.workflow_states where code = 'SENTENCIA_1';
  select id into s_ejecucion  from public.workflow_states where code = 'EJECUCION';
  select id into s_acuerdo    from public.workflow_states where code = 'ACUERDO';

  if s_contestado is null or s_autos is null then
    raise exception 'Faltan estados del ciclo de vida. ¿Corriste la migración 25?';
  end if;

  -- ── 1. Expedientes ─────────────────────────────────────────────────────────
  -- `on conflict do nothing` + un `select` posterior para recuperar el id:
  -- con do-nothing el RETURNING viene vacío en la segunda corrida.

  insert into public.case_files (
    case_number, caption, title, jurisdiction, court, clerk_office, matter,
    current_status_id, responsible_attorney_id, created_by, updated_by,
    processing_phase, filing_date, last_activity_at, claim_amount,
    summary, confidence_overall, procedural_acts, legal_claim,
    documents_detected, important_dates
  ) values

  -- (1) Plazo vencido → banner rojo T-0
  ('25.432/2025',
   'García, María c/ Seguros Rivadavia S.A. s/ accidente de trabajo',
   'García, María c/ Seguros Rivadavia S.A. s/ accidente de trabajo',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 14', 'Secretaría Única',
   'Accidentes de trabajo',
   s_traslado, v_user, v_user, v_user, 'complete',
   current_date - 90, now() - interval '25 days', 8400000.00,
   'La actora, empleada administrativa de 41 años, sufrió una caída desde un ' ||
   'estante en el depósito de su empleadora el 12/03/2025, con fractura de ' ||
   'tobillo derecho y posterior osteosíntesis. La ART reconoció el siniestro ' ||
   'pero otorgó el alta con 8% de incapacidad, porcentaje que la actora ' ||
   'controvierte. Se reclama la diferencia indemnizatoria del art. 14 ap. 2 ' ||
   'inc. a) LRT más daño moral. Traslado de demanda notificado; el plazo para ' ||
   'contestar se encuentra vencido.',
   'High',
   jsonb_build_array(jsonb_build_object(
     'act_type', 'TRASLADO_DEMANDA',
     'document_type', 'CEDULA',
     'document_date', to_char(current_date - 33, 'YYYY-MM-DD'),
     'notification_date', to_char(current_date - 31, 'YYYY-MM-DD'),
     'description', 'Cédula de notificación de traslado de demanda'
   )),
   jsonb_build_object(
     'claim_type', 'Indemnización por incapacidad laboral permanente parcial',
     'legal_basis', jsonb_build_array('Ley 24.557 art. 14 ap. 2 inc. a)', 'Ley 26.773 art. 3', 'CCyCN art. 1741'),
     'amount_claimed', 8400000.00,
     'disability_percentage_claimed', '23%'
   ),
   jsonb_build_array('Demanda', 'Cédula de notificación', 'Certificado médico', 'Dictamen Comisión Médica'),
   jsonb_build_array(
     jsonb_build_object('label', 'Fecha del accidente',       'date', to_char(current_date - 496, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Interposición de demanda',  'date', to_char(current_date - 90,  'YYYY-MM-DD')),
     jsonb_build_object('label', 'Notificación del traslado', 'date', to_char(current_date - 31,  'YYYY-MM-DD'))
   )),

  -- (2) Plazo próximo → banner ámbar T-10 / fila urgente
  ('18.901/2026',
   'López, Juan C. c/ Provincia ART S.A. s/ ley de riesgos',
   'López, Juan C. c/ Provincia ART S.A. s/ ley de riesgos',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 47', 'Secretaría Única',
   'Riesgos del Trabajo',
   s_prueba, v_user, v_user, v_user, 'complete',
   current_date - 240, now() - interval '10 days', 6250000.00,
   'Operario de mantenimiento industrial de 36 años que denuncia hipoacusia ' ||
   'perceptiva bilateral por exposición sostenida a ruido en planta. La ART ' ||
   'rechazó el carácter profesional de la dolencia. Contestada la demanda, el ' ||
   'juzgado abrió la causa a prueba; corre el plazo para ofrecer prueba ' ||
   'pericial médica y testimonial.',
   'High',
   jsonb_build_array(jsonb_build_object(
     'act_type', 'APERTURA_PRUEBA',
     'document_type', 'PROVIDENCIA',
     'document_date', to_char(current_date - 12, 'YYYY-MM-DD'),
     'notification_date', to_char(current_date - 11, 'YYYY-MM-DD'),
     'description', 'Providencia de apertura de la causa a prueba'
   )),
   jsonb_build_object(
     'claim_type', 'Enfermedad profesional — hipoacusia perceptiva bilateral',
     'legal_basis', jsonb_build_array('Ley 24.557', 'Decreto 658/96 (Listado de enfermedades profesionales)'),
     'amount_claimed', 6250000.00,
     'disability_percentage_claimed', '18%'
   ),
   jsonb_build_array('Demanda', 'Contestación de demanda', 'Providencia de apertura a prueba', 'Audiometrías'),
   jsonb_build_array(
     jsonb_build_object('label', 'Primera manifestación invalidante', 'date', to_char(current_date - 420, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Apertura a prueba',                 'date', to_char(current_date - 11,  'YYYY-MM-DD'))
   )),

  -- (3) Al día → plazo cumplido, sin pendientes
  ('12.744/2026',
   'Rodríguez, Ana P. c/ Galeno ART S.A. s/ indemnización',
   'Rodríguez, Ana P. c/ Galeno ART S.A. s/ indemnización',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 22', 'Secretaría Única',
   'Accidentes de trabajo',
   s_contestado, v_user, v_user, v_user, 'complete',
   current_date - 150, now() - interval '3 days', 4900000.00,
   'Auxiliar de enfermería que sufrió lumbalgia con hernia discal L4-L5 tras ' ||
   'la movilización de un paciente. La ART abonó prestaciones dinerarias ' ||
   'parciales. Se reclama la diferencia y el adicional del art. 3 de la ley ' ||
   '26.773. El traslado de demanda fue contestado en término.',
   'High',
   jsonb_build_array(jsonb_build_object(
     'act_type', 'TRASLADO_DEMANDA',
     'document_type', 'CEDULA',
     'document_date', to_char(current_date - 47, 'YYYY-MM-DD'),
     'notification_date', to_char(current_date - 45, 'YYYY-MM-DD'),
     'description', 'Cédula de notificación de traslado de demanda'
   )),
   jsonb_build_object(
     'claim_type', 'Diferencia de indemnización por incapacidad parcial permanente',
     'legal_basis', jsonb_build_array('Ley 24.557 art. 14', 'Ley 26.773 art. 3'),
     'amount_claimed', 4900000.00,
     'disability_percentage_claimed', '15%'
   ),
   jsonb_build_array('Demanda', 'Cédula de notificación', 'Contestación de demanda', 'RMN de columna lumbar'),
   jsonb_build_array(
     jsonb_build_object('label', 'Interposición de demanda',  'date', to_char(current_date - 150, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Contestación de demanda',   'date', to_char(current_date - 10,  'YYYY-MM-DD'))
   )),

  -- (4) En ejecución → historial completo de 10 transiciones
  ('8.312/2024',
   'Fernández, Roberto c/ Mapfre Argentina ART S.A. s/ accidente in itinere',
   'Fernández, Roberto c/ Mapfre Argentina ART S.A. s/ accidente in itinere',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 3', 'Secretaría Única',
   'Accidentes de trabajo',
   s_ejecucion, v_user, v_user, v_user, 'complete',
   current_date - 730, now() - interval '15 days', 12500000.00,
   'Accidente in itinere: el actor, chofer de reparto de 52 años, fue ' ||
   'embestido por un automóvil mientras se dirigía a su lugar de trabajo, ' ||
   'sufriendo fractura expuesta de tibia y peroné con secuelas funcionales ' ||
   'permanentes. Dictada sentencia de primera instancia favorable, quedó ' ||
   'firme al no ser apelada. La causa se encuentra en etapa de ejecución de ' ||
   'la condena.',
   'High',
   jsonb_build_array(jsonb_build_object(
     'act_type', 'SENTENCIA_PRIMERA_INSTANCIA',
     'document_type', 'SENTENCIA',
     'document_date', to_char(current_date - 120, 'YYYY-MM-DD'),
     'notification_date', to_char(current_date - 118, 'YYYY-MM-DD'),
     'description', 'Sentencia definitiva de primera instancia — hace lugar a la demanda'
   )),
   jsonb_build_object(
     'claim_type', 'Indemnización por accidente in itinere',
     'legal_basis', jsonb_build_array('Ley 24.557 art. 6 ap. 1', 'Ley 26.773 art. 3'),
     'amount_claimed', 12500000.00,
     'amount_awarded', 11800000.00,
     'disability_percentage_claimed', '35%'
   ),
   jsonb_build_array('Demanda', 'Contestación', 'Pericia médica', 'Alegatos', 'Sentencia', 'Liquidación'),
   jsonb_build_array(
     jsonb_build_object('label', 'Fecha del accidente', 'date', to_char(current_date - 900, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Sentencia 1ª instancia', 'date', to_char(current_date - 120, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Sentencia firme',        'date', to_char(current_date - 95,  'YYYY-MM-DD'))
   )),

  -- (5) Riesgo de caducidad → 85 días sin impulso
  ('31.209/2025',
   'Martínez, Carlos D. c/ Consolidar ART S.A. s/ diferencia de indemnización',
   'Martínez, Carlos D. c/ Consolidar ART S.A. s/ diferencia de indemnización',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 56', 'Secretaría Única',
   'Riesgos del Trabajo',
   s_prueba, v_user, v_user, v_user, 'complete',
   current_date - 365, now() - interval '85 days', 3100000.00,
   'Soldador de 47 años con síndrome del túnel carpiano bilateral atribuido a ' ||
   'movimientos repetitivos. Abierta la causa a prueba, la pericia médica ' ||
   'quedó pendiente de designación y el expediente no registra impulso ' ||
   'procesal desde hace casi tres meses. Riesgo concreto de caducidad de ' ||
   'instancia (art. 310 CPCCN).',
   'High',
   '[]'::jsonb,
   jsonb_build_object(
     'claim_type', 'Diferencia de indemnización — enfermedad profesional',
     'legal_basis', jsonb_build_array('Ley 24.557', 'Decreto 658/96'),
     'amount_claimed', 3100000.00,
     'disability_percentage_claimed', '12%'
   ),
   jsonb_build_array('Demanda', 'Contestación de demanda', 'Auto de apertura a prueba'),
   jsonb_build_array(
     jsonb_build_object('label', 'Última actuación procesal', 'date', to_char(current_date - 85, 'YYYY-MM-DD'))
   )),

  -- (6) Cerrado por acuerdo → estado terminal
  ('5.678/2024',
   'Gómez, Lucía V. c/ Prevención ART S.A. s/ acción de amparo',
   'Gómez, Lucía V. c/ Prevención ART S.A. s/ acción de amparo',
   'CABA', 'Juzgado Nacional del Trabajo Nro. 38', 'Secretaría Única',
   'Accidentes de trabajo',
   s_acuerdo, v_user, v_user, v_user, 'complete',
   current_date - 548, now() - interval '45 days', 5400000.00,
   'Acción de amparo promovida para que la ART restituyera las prestaciones ' ||
   'en especie interrumpidas durante el tratamiento kinesiológico de la ' ||
   'actora. Corrido el traslado, las partes arribaron a un acuerdo ' ||
   'conciliatorio homologado que contempla la reanudación del tratamiento y ' ||
   'una suma única en concepto de incapacidad. Expediente concluido.',
   'High',
   '[]'::jsonb,
   jsonb_build_object(
     'claim_type', 'Amparo — restitución de prestaciones en especie',
     'legal_basis', jsonb_build_array('CN art. 43', 'Ley 24.557 art. 20'),
     'amount_claimed', 5400000.00,
     'amount_settled', 5400000.00
   ),
   jsonb_build_array('Demanda de amparo', 'Contestación', 'Acta de acuerdo', 'Auto homologatorio'),
   jsonb_build_array(
     jsonb_build_object('label', 'Interposición del amparo', 'date', to_char(current_date - 548, 'YYYY-MM-DD')),
     jsonb_build_object('label', 'Acuerdo homologado',       'date', to_char(current_date - 45,  'YYYY-MM-DD'))
   ))

  on conflict on constraint uq_case_files_case_number_active do nothing;

  select id into c_vencido from public.case_files where case_number = '25.432/2025' and deleted_at is null;
  select id into c_urgente from public.case_files where case_number = '18.901/2026' and deleted_at is null;
  select id into c_aldia   from public.case_files where case_number = '12.744/2026' and deleted_at is null;
  select id into c_ejec    from public.case_files where case_number = '8.312/2024'  and deleted_at is null;
  select id into c_caduc   from public.case_files where case_number = '31.209/2025' and deleted_at is null;
  select id into c_cerrado from public.case_files where case_number = '5.678/2024'  and deleted_at is null;

  -- Re-corrida: refrescar last_activity_at y estado, que el resto del script
  -- asume vigentes (el `do nothing` de arriba no actualiza nada).
  update public.case_files set last_activity_at = now() - interval '25 days', current_status_id = s_traslado   where id = c_vencido;
  update public.case_files set last_activity_at = now() - interval '10 days', current_status_id = s_prueba     where id = c_urgente;
  update public.case_files set last_activity_at = now() - interval '3 days',  current_status_id = s_contestado where id = c_aldia;
  update public.case_files set last_activity_at = now() - interval '15 days', current_status_id = s_ejecucion  where id = c_ejec;
  update public.case_files set last_activity_at = now() - interval '85 days', current_status_id = s_prueba     where id = c_caduc;
  update public.case_files set last_activity_at = now() - interval '45 days', current_status_id = s_acuerdo    where id = c_cerrado;

  -- ── 2. Limpieza de datos derivados (ver nota de idempotencia arriba) ───────

  delete from public.case_deadlines
   where case_file_id in (c_vencido, c_urgente, c_aldia, c_ejec, c_caduc, c_cerrado);
  delete from public.workflow_transitions
   where case_file_id in (c_vencido, c_urgente, c_aldia, c_ejec, c_caduc, c_cerrado);
  delete from public.case_file_parties
   where case_file_id in (c_vencido, c_urgente, c_aldia, c_ejec, c_caduc, c_cerrado);

  -- ── 3. Plazos ──────────────────────────────────────────────────────────────

  -- (1) VENCIDO hace 2 días, todavía PENDIENTE → dispara el banner rojo T-0
  --     (countOverdueDeadlines cuenta PENDIENTE con vencimiento <= hoy).
  d_inicio := current_date - 31;   -- ~22 días hábiles atrás
  insert into public.case_deadlines (
    case_file_id, act_type, description, dias_habiles,
    fecha_inicio, fecha_vencimiento, estado, tipo, triggered_by_act, is_auto_generated
  ) values (
    c_vencido, 'TRASLADO_DEMANDA',
    'Contestar traslado de demanda', 15,
    d_inicio, current_date - 2, 'PENDIENTE', 'FATAL',
    jsonb_build_object(
      'act_type', 'TRASLADO_DEMANDA', 'document_type', 'CEDULA',
      'notification_date', to_char(d_inicio, 'YYYY-MM-DD'),
      'description', 'Cédula de notificación de traslado de demanda'
    ), true
  );

  -- (2) Vence en 3 días → fila ámbar + banner de plazos próximos
  d_inicio := current_date - 11;   -- ~8 días hábiles atrás
  insert into public.case_deadlines (
    case_file_id, act_type, description, dias_habiles,
    fecha_inicio, fecha_vencimiento, estado, tipo, triggered_by_act, is_auto_generated
  ) values (
    c_urgente, 'APERTURA_PRUEBA',
    'Ofrecer prueba', 10,
    d_inicio, current_date + 3, 'PENDIENTE', 'FATAL',
    jsonb_build_object(
      'act_type', 'APERTURA_PRUEBA', 'document_type', 'PROVIDENCIA',
      'notification_date', to_char(d_inicio, 'YYYY-MM-DD'),
      'description', 'Providencia de apertura de la causa a prueba'
    ), true
  );

  -- (3) CUMPLIDO → is_auto_generated=false para que el motor no lo regenere
  d_inicio := current_date - 45;
  insert into public.case_deadlines (
    case_file_id, act_type, description, dias_habiles,
    fecha_inicio, fecha_vencimiento, estado, tipo, triggered_by_act,
    is_auto_generated, completed_at, completed_by
  ) values (
    c_aldia, 'TRASLADO_DEMANDA',
    'Contestar traslado de demanda', 15,
    d_inicio, current_date - 24, 'CUMPLIDO', 'FATAL',
    jsonb_build_object(
      'act_type', 'TRASLADO_DEMANDA', 'document_type', 'CEDULA',
      'notification_date', to_char(d_inicio, 'YYYY-MM-DD'),
      'description', 'Cédula de notificación de traslado de demanda'
    ), false, now() - interval '10 days', v_user
  );

  -- (5) Caducidad de instancia: 90 días hábiles ≈ 130 corridos desde la última
  --     actuación. Con 85 días de silencio el vencimiento cae a ~45 días vista.
  d_inicio := current_date - 85;
  insert into public.case_deadlines (
    case_file_id, act_type, description, dias_habiles,
    fecha_inicio, fecha_vencimiento, estado, tipo, triggered_by_act, is_auto_generated
  ) values (
    c_caduc, 'CADUCIDAD_INSTANCIA',
    'Caducidad de instancia — impulsar el procedimiento (art. 310 CPCCN)', 90,
    d_inicio, d_inicio + 130, 'PENDIENTE', 'FATAL',
    jsonb_build_object(
      'act_type', 'CADUCIDAD_INSTANCIA', 'document_type', 'SISTEMA',
      'notification_date', to_char(d_inicio, 'YYYY-MM-DD'),
      'description', 'Detectado por el timer pasivo de caducidad (sin impulso procesal)'
    ), true
  );

  -- (4) y (6) no llevan plazos: uno está en ejecución y el otro cerrado.

  -- ── 4. Historial de transiciones ───────────────────────────────────────────

  -- (4) Recorrido completo, 10 transiciones a lo largo de ~2 años.
  insert into public.workflow_transitions
    (case_file_id, from_state_id, to_state_id, trigger_type, triggered_by, justification, source_act_type, created_at)
  values
    (c_ejec, null,          s_iniciado,   'AUTO',   null,   null, null,                          now() - interval '730 days'),
    (c_ejec, s_iniciado,    s_admitido,   'AUTO',   null,   null, 'ADMISION_DEMANDA',            now() - interval '700 days'),
    (c_ejec, s_admitido,    s_notificando,'AUTO',   null,   null, 'LIBRAMIENTO_CEDULA',          now() - interval '672 days'),
    (c_ejec, s_notificando, s_traslado,   'AUTO',   null,   null, 'TRASLADO_DEMANDA',            now() - interval '640 days'),
    (c_ejec, s_traslado,    s_contestado, 'AUTO',   null,   null, 'CONTESTACION_DEMANDA',        now() - interval '610 days'),
    (c_ejec, s_contestado,  s_prueba,     'AUTO',   null,   null, 'APERTURA_PRUEBA',             now() - interval '560 days'),
    (c_ejec, s_prueba,      s_alegatos,   'AUTO',   null,   null, 'CLAUSURA_PRUEBA',             now() - interval '300 days'),
    (c_ejec, s_alegatos,    s_autos,      'AUTO',   null,   null, 'LLAMAMIENTO_AUTOS',           now() - interval '210 days'),
    (c_ejec, s_autos,       s_sentencia,  'AUTO',   null,   null, 'SENTENCIA_PRIMERA_INSTANCIA', now() - interval '120 days'),
    (c_ejec, s_sentencia,   s_ejecucion,  'MANUAL', v_user,
       'Sentencia firme: vencido el plazo para apelar sin que la demandada dedujera recurso. Se inicia la ejecución.',
       null, now() - interval '15 days');

  -- (6) Bifurcación EN_TRASLADO → ACUERDO, sin pasar por prueba ni sentencia.
  insert into public.workflow_transitions
    (case_file_id, from_state_id, to_state_id, trigger_type, triggered_by, justification, source_act_type, created_at)
  values
    (c_cerrado, null,           s_iniciado,    'AUTO',   null,   null, null,                   now() - interval '548 days'),
    (c_cerrado, s_iniciado,     s_admitido,    'AUTO',   null,   null, 'ADMISION_DEMANDA',     now() - interval '530 days'),
    (c_cerrado, s_admitido,     s_notificando, 'AUTO',   null,   null, 'LIBRAMIENTO_CEDULA',   now() - interval '505 days'),
    (c_cerrado, s_notificando,  s_traslado,    'AUTO',   null,   null, 'TRASLADO_DEMANDA',     now() - interval '480 days'),
    (c_cerrado, s_traslado,     s_acuerdo,     'MANUAL', v_user,
       'Acuerdo conciliatorio homologado por el juzgado. Las partes desisten de la acción y del derecho.',
       null, now() - interval '45 days');

  -- Historial mínimo para los otros cuatro, para que la pestaña no quede vacía.
  insert into public.workflow_transitions
    (case_file_id, from_state_id, to_state_id, trigger_type, triggered_by, justification, source_act_type, created_at)
  values
    (c_vencido, null,          s_iniciado,   'AUTO', null, null, null,                 now() - interval '90 days'),
    (c_vencido, s_iniciado,    s_admitido,   'AUTO', null, null, 'ADMISION_DEMANDA',   now() - interval '70 days'),
    (c_vencido, s_admitido,    s_notificando,'AUTO', null, null, 'LIBRAMIENTO_CEDULA', now() - interval '50 days'),
    (c_vencido, s_notificando, s_traslado,   'AUTO', null, null, 'TRASLADO_DEMANDA',   now() - interval '25 days'),

    (c_urgente, null,          s_iniciado,   'AUTO', null, null, null,                   now() - interval '240 days'),
    (c_urgente, s_iniciado,    s_admitido,   'AUTO', null, null, 'ADMISION_DEMANDA',     now() - interval '220 days'),
    (c_urgente, s_admitido,    s_notificando,'AUTO', null, null, 'LIBRAMIENTO_CEDULA',   now() - interval '200 days'),
    (c_urgente, s_notificando, s_traslado,   'AUTO', null, null, 'TRASLADO_DEMANDA',     now() - interval '170 days'),
    (c_urgente, s_traslado,    s_contestado, 'AUTO', null, null, 'CONTESTACION_DEMANDA', now() - interval '60 days'),
    (c_urgente, s_contestado,  s_prueba,     'AUTO', null, null, 'APERTURA_PRUEBA',      now() - interval '10 days'),

    (c_aldia, null,          s_iniciado,   'AUTO', null, null, null,                   now() - interval '150 days'),
    (c_aldia, s_iniciado,    s_admitido,   'AUTO', null, null, 'ADMISION_DEMANDA',     now() - interval '130 days'),
    (c_aldia, s_admitido,    s_notificando,'AUTO', null, null, 'LIBRAMIENTO_CEDULA',   now() - interval '100 days'),
    (c_aldia, s_notificando, s_traslado,   'AUTO', null, null, 'TRASLADO_DEMANDA',     now() - interval '45 days'),
    (c_aldia, s_traslado,    s_contestado, 'AUTO', null, null, 'CONTESTACION_DEMANDA', now() - interval '3 days'),

    (c_caduc, null,          s_iniciado,   'AUTO', null, null, null,                   now() - interval '365 days'),
    (c_caduc, s_iniciado,    s_admitido,   'AUTO', null, null, 'ADMISION_DEMANDA',     now() - interval '340 days'),
    (c_caduc, s_admitido,    s_notificando,'AUTO', null, null, 'LIBRAMIENTO_CEDULA',   now() - interval '310 days'),
    (c_caduc, s_notificando, s_traslado,   'AUTO', null, null, 'TRASLADO_DEMANDA',     now() - interval '260 days'),
    (c_caduc, s_traslado,    s_contestado, 'AUTO', null, null, 'CONTESTACION_DEMANDA', now() - interval '180 days'),
    (c_caduc, s_contestado,  s_prueba,     'AUTO', null, null, 'APERTURA_PRUEBA',      now() - interval '85 days');

  -- ── 5. Actor de cada expediente ────────────────────────────────────────────

  insert into public.case_file_plaintiff
    (case_file_id, full_name, dni, cuil, birth_date, nationality, marital_status, address, city, province)
  values
    (c_vencido, 'María Elena García', '28.455.912', '27-28455912-4', date '1981-06-14', 'Argentina', 'Casada',
     'Av. Rivadavia 5842, 3° B', 'Ciudad Autónoma de Buenos Aires', 'CABA'),
    (c_urgente, 'Juan Carlos López', '31.207.884', '20-31207884-9', date '1990-02-03', 'Argentina', 'Soltero',
     'Bermúdez 1420', 'Ciudad Autónoma de Buenos Aires', 'CABA'),
    (c_aldia, 'Ana Paula Rodríguez', '33.918.226', '27-33918226-1', date '1988-11-27', 'Argentina', 'Divorciada',
     'Charcas 3355, 6° A', 'Ciudad Autónoma de Buenos Aires', 'CABA'),
    (c_ejec, 'Roberto Daniel Fernández', '20.114.673', '20-20114673-5', date '1974-09-08', 'Argentina', 'Casado',
     'Chilavert 2210', 'Lanús Oeste', 'Buenos Aires'),
    (c_caduc, 'Carlos Damián Martínez', '24.780.331', '20-24780331-7', date '1979-04-19', 'Argentina', 'Casado',
     'Pasaje Los Andes 745', 'San Martín', 'Buenos Aires'),
    (c_cerrado, 'Lucía Verónica Gómez', '35.602.417', '27-35602417-3', date '1991-08-30', 'Argentina', 'Soltera',
     'Av. Nazca 1188, 2° C', 'Ciudad Autónoma de Buenos Aires', 'CABA')
  on conflict (case_file_id) do nothing;

  -- ── 6. Contraparte (la ART / aseguradora) ──────────────────────────────────

  insert into public.case_file_parties (case_file_id, name, role, party_type, cuit, notes) values
    (c_vencido, 'Seguros Rivadavia S.A.',        'defendant', 'ART', '30-50004946-8', 'Aseguradora demandada'),
    (c_urgente, 'Provincia ART S.A.',            'defendant', 'ART', '30-68522832-4', 'Aseguradora demandada'),
    (c_aldia,   'Galeno ART S.A.',               'defendant', 'ART', '30-68110615-0', 'Aseguradora demandada'),
    (c_ejec,    'Mapfre Argentina ART S.A.',     'defendant', 'ART', '30-69347116-2', 'Aseguradora condenada en primera instancia'),
    (c_caduc,   'Consolidar ART S.A.',           'defendant', 'ART', '30-68537246-8', 'Aseguradora demandada'),
    (c_cerrado, 'Prevención ART S.A.',           'defendant', 'ART', '30-68189745-1', 'Aseguradora — acuerdo homologado');

  -- ── 7. Detalle ampliado (solo 1, 2 y 4, para dar variedad) ─────────────────

  insert into public.case_file_accident
    (case_file_id, accident_type, accident_date, accident_time, location, province, city, description, work_activity, mechanism)
  values
    (c_vencido, 'Accidente de trabajo', current_date - 496, '10:40',
     'Depósito de la empleadora, Av. Warnes 2100', 'CABA', 'Ciudad Autónoma de Buenos Aires',
     'La actora cayó desde una escalera de mano al intentar alcanzar cajas ubicadas en un estante superior.',
     'Tareas administrativas y de control de stock', 'Caída de altura'),
    (c_urgente, 'Enfermedad profesional', current_date - 420, null,
     'Planta industrial, Parque Industrial Pilar', 'Buenos Aires', 'Pilar',
     'Exposición sostenida a niveles de ruido superiores a 85 dB durante ocho años sin protección auditiva adecuada.',
     'Mantenimiento industrial', 'Exposición a agente físico (ruido)'),
    (c_ejec, 'Accidente in itinere', current_date - 900, '06:55',
     'Intersección de Av. Hipólito Yrigoyen y Colón, Lanús', 'Buenos Aires', 'Lanús',
     'El actor fue embestido por un automóvil mientras se dirigía en motocicleta desde su domicilio al trabajo.',
     'Chofer de reparto', 'Colisión vehicular')
  on conflict (case_file_id) do nothing;

  insert into public.case_file_medical
    (case_file_id, diagnosis, affected_body_parts, medical_leave_start, medical_discharge_date,
     surgeries, treatments, current_limitations, psychological_damage_claimed, permanent_disability)
  values
    (c_vencido,
     '["Fractura bimaleolar de tobillo derecho", "Limitación funcional residual"]'::jsonb,
     '["Tobillo derecho", "Pie derecho"]'::jsonb,
     current_date - 496, current_date - 350,
     '["Osteosíntesis con placa y tornillos"]'::jsonb,
     '["Kinesiología (40 sesiones)", "Analgesia"]'::jsonb,
     '["Dificultad para permanecer de pie más de una hora", "Imposibilidad de subir escaleras sin apoyo"]'::jsonb,
     true, '23% T.O. (según pericia de parte)'),
    (c_urgente,
     '["Hipoacusia perceptiva bilateral"]'::jsonb,
     '["Oído derecho", "Oído izquierdo"]'::jsonb,
     null, null,
     '[]'::jsonb,
     '["Control otorrinolaringológico periódico", "Audífono bilateral"]'::jsonb,
     '["Dificultad de comprensión del habla en ambientes ruidosos"]'::jsonb,
     false, '18% T.O. (reclamado)'),
    (c_ejec,
     '["Fractura expuesta de tibia y peroné derechos", "Acortamiento de miembro inferior derecho"]'::jsonb,
     '["Pierna derecha", "Rodilla derecha"]'::jsonb,
     current_date - 900, current_date - 620,
     '["Osteosíntesis con clavo endomedular", "Injerto óseo"]'::jsonb,
     '["Kinesiología prolongada (120 sesiones)", "Rehabilitación de la marcha"]'::jsonb,
     '["Marcha claudicante", "Imposibilidad de conducir vehículos de reparto"]'::jsonb,
     true, '35% T.O. (reconocido en sentencia)')
  on conflict (case_file_id) do nothing;

  insert into public.case_file_insurance (case_file_id, name, cuit, claim_number, policy_number) values
    (c_vencido, 'Seguros Rivadavia S.A.',    '30-50004946-8', 'SR-2025-004512', 'POL-118422'),
    (c_urgente, 'Provincia ART S.A.',        '30-68522832-4', 'PART-2025-88710', 'POL-903117'),
    (c_ejec,    'Mapfre Argentina ART S.A.', '30-69347116-2', 'MAP-2023-21094',  'POL-447820')
  on conflict (case_file_id) do nothing;

  insert into public.case_file_employer (case_file_id, company_name, cuit, activity) values
    (c_vencido, 'Distribuidora Warnes S.R.L.',   '30-71044238-6', 'Distribución mayorista de artículos de librería'),
    (c_urgente, 'Metalúrgica del Norte S.A.',    '30-70889113-2', 'Fabricación de estructuras metálicas'),
    (c_ejec,    'Logística Sur Express S.R.L.',  '30-71255604-9', 'Transporte y reparto de mercadería')
  on conflict (case_file_id) do nothing;

  raise notice 'Seed completado para % — 6 expedientes.', v_email;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────────────

select cf.case_number,
       cf.caption,
       ws.label as estado,
       (select count(*) from public.case_deadlines cd
         where cd.case_file_id = cf.id and cd.estado = 'PENDIENTE') as plazos_pendientes,
       (select count(*) from public.case_deadlines cd
         where cd.case_file_id = cf.id and cd.estado = 'PENDIENTE'
           and cd.fecha_vencimiento <= current_date)                as plazos_vencidos_t0,
       (select count(*) from public.case_deadlines cd
         where cd.case_file_id = cf.id and cd.estado = 'CUMPLIDO')  as plazos_cumplidos,
       (select count(*) from public.workflow_transitions wt
         where wt.case_file_id = cf.id)                             as transiciones
from public.case_files cf
join public.workflow_states ws on ws.id = cf.current_status_id
where cf.created_by = (select id from public.users where email = 'socio.demo@brainlab.test')
  and cf.deleted_at is null
order by cf.case_number;
