-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 24: Ciclo de vida del expediente (state machine judicial)
--
-- Tres piezas:
--   1. workflow_states resembrado con el proceso CPCCN real (estados en español)
--   2. workflow_allowed_transitions — catálogo de qué transición es válida
--   3. workflow_transitions — auditoría de cada cambio de estado
--
-- Sobre el resembrado: NO se puede hacer `delete from workflow_states` a secas.
-- case_files.current_status_id es NOT NULL con `on delete restrict`, así que
-- cualquier expediente existente bloquea el DELETE. La secuencia correcta es
-- insertar los estados nuevos → remapear los expedientes → recién ahí borrar
-- los viejos, que a esa altura ya no tienen referencias.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Estados del proceso CPCCN ─────────────────────────────────────────────

insert into public.workflow_states (code, label, description, sort_order, is_terminal) values
  ('INICIADO',     'Iniciado',              'Expediente creado, documentos cargados',            10, false),
  ('ADMITIDO',     'Admitido',              'Demanda admitida por el juzgado',                   20, false),
  ('NOTIFICANDO',  'Notificando',           'En proceso de notificación a la demandada',         30, false),
  ('REBELDE',      'En rebeldía',           'Demandado declarado rebelde',                       35, false),
  ('EN_TRASLADO',  'En traslado',           'Traslado de demanda corriendo',                     40, false),
  ('PRUEBA',       'Período de prueba',     'Apertura a prueba, ofreciendo/produciendo prueba',   50, false),
  ('ALEGATOS',     'Alegatos',              'Período de alegatos',                               60, false),
  ('SENTENCIA_1',  'Sentencia 1ª instancia','Esperando o dictada sentencia de primera instancia',70, false),
  ('APELACION',    'Apelación',             'Recurso de apelación en trámite',                   80, false),
  ('EJECUCION',    'Ejecución',             'Sentencia firme, en ejecución',                     90, false),
  ('ACUERDO',      'Acuerdo/Conciliación',  'Caso resuelto por acuerdo extrajudicial',           95, true),
  ('CADUCIDAD',    'Caducidad declarada',   'Instancia caducada',                                96, true),
  ('CERRADO',      'Cerrado',               'Expediente cerrado',                               100, true)
on conflict (code) do nothing;

-- Remapear los expedientes que quedaron apuntando a los estados en inglés.
-- Sin esto el DELETE de abajo falla con 23503 (foreign key violation).
update public.case_files cf
set current_status_id = nuevo.id
from (values
  ('initial_filing',      'INICIADO'),
  ('service_of_process',  'NOTIFICANDO'),
  ('answer_period',       'EN_TRASLADO'),
  ('preliminary_hearing', 'PRUEBA'),
  ('evidentiary_period',  'PRUEBA'),
  ('closing_arguments',   'ALEGATOS'),
  ('judgment',            'SENTENCIA_1'),
  ('appeal',              'APELACION'),
  ('enforcement',         'EJECUCION'),
  ('closed',              'CERRADO'),
  ('archived',            'CERRADO')
) as mapa(old_code, new_code)
join public.workflow_states viejo on viejo.code = mapa.old_code
join public.workflow_states nuevo on nuevo.code = mapa.new_code
where cf.current_status_id = viejo.id;

-- Ahora sí: los estados en inglés quedaron sin referencias.
delete from public.workflow_states
where code in (
  'initial_filing', 'service_of_process', 'answer_period', 'preliminary_hearing',
  'evidentiary_period', 'closing_arguments', 'judgment', 'appeal',
  'enforcement', 'closed', 'archived'
);

-- ── 2. Transiciones permitidas ───────────────────────────────────────────────
-- Catálogo de solo lectura: define qué aristas del grafo son válidas. Se
-- referencia por `code` y no por id para que leerlo sea legible sin joins.

create table if not exists public.workflow_allowed_transitions (
  from_state_code text not null,
  to_state_code   text not null,
  primary key (from_state_code, to_state_code)
);

comment on table public.workflow_allowed_transitions is
  'Aristas válidas del grafo de estados. Toda transición (AUTO o MANUAL) se valida contra esta tabla.';

insert into public.workflow_allowed_transitions (from_state_code, to_state_code) values
  ('INICIADO',    'ADMITIDO'),
  ('ADMITIDO',    'NOTIFICANDO'),
  ('NOTIFICANDO', 'EN_TRASLADO'),
  ('NOTIFICANDO', 'REBELDE'),
  ('EN_TRASLADO', 'PRUEBA'),
  ('EN_TRASLADO', 'ACUERDO'),
  ('REBELDE',     'PRUEBA'),
  ('PRUEBA',      'ALEGATOS'),
  ('ALEGATOS',    'SENTENCIA_1'),
  ('SENTENCIA_1', 'APELACION'),
  ('SENTENCIA_1', 'EJECUCION'),
  ('SENTENCIA_1', 'ACUERDO'),
  ('APELACION',   'EJECUCION'),
  ('EJECUCION',   'CERRADO'),
  -- La caducidad puede declararse desde cualquier estado con instancia abierta.
  ('NOTIFICANDO', 'CADUCIDAD'),
  ('EN_TRASLADO', 'CADUCIDAD'),
  ('PRUEBA',      'CADUCIDAD'),
  ('ALEGATOS',    'CADUCIDAD')
on conflict do nothing;

alter table public.workflow_allowed_transitions enable row level security;

drop policy if exists "All authenticated users can read allowed transitions"
  on public.workflow_allowed_transitions;
create policy "All authenticated users can read allowed transitions"
  on public.workflow_allowed_transitions for select
  to authenticated
  using (true);

-- ── 3. Auditoría de transiciones ─────────────────────────────────────────────

create table if not exists public.workflow_transitions (
  id            uuid primary key default gen_random_uuid(),
  case_file_id  uuid not null references public.case_files(id) on delete cascade,
  from_state_id uuid references public.workflow_states(id),  -- null en la transición inicial
  to_state_id   uuid not null references public.workflow_states(id),
  trigger_type  text not null check (trigger_type in ('AUTO', 'MANUAL')),
  triggered_by  uuid references auth.users(id),              -- null si fue AUTO
  justification text,                                        -- requerido para MANUAL
  source_act_type text,                                      -- act_type del LLM que disparó AUTO
  document_ref  text,                                        -- referencia al documento fuente
  created_at    timestamptz not null default now()
);

comment on table public.workflow_transitions is
  'Historial append-only de cambios de estado. AUTO = disparado por el pipeline; MANUAL = acción de un usuario.';

create index if not exists idx_wt_case_file_id on public.workflow_transitions (case_file_id);
create index if not exists idx_wt_created_at   on public.workflow_transitions (created_at);

alter table public.workflow_transitions enable row level security;

-- Patrón satélite estándar del proyecto: delegar en can_access_case() (mig. 23).
drop policy if exists "workflow_transitions_select" on public.workflow_transitions;
create policy "workflow_transitions_select" on public.workflow_transitions
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "workflow_transitions_insert" on public.workflow_transitions;
create policy "workflow_transitions_insert" on public.workflow_transitions
  for insert to authenticated with check (public.can_access_case(case_file_id));
