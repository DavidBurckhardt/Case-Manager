-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 20: Deadline engine — tabla case_deadlines
--
-- Plazos procesales generados por el motor a partir de procedural_acts.
-- El motor puede regenerar todos los plazos con is_auto_generated=true sin
-- tocar los que el usuario marcó como CUMPLIDO (is_auto_generated=false).
-- La constraint unique(case_file_id, act_type, fecha_inicio) garantiza
-- idempotencia frente a redelivery de JetStream.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.case_deadlines (
  id                 uuid        primary key default gen_random_uuid(),
  case_file_id       uuid        not null references public.case_files(id) on delete cascade,
  act_type           text        not null,
  description        text        not null,
  dias_habiles       int         not null,
  fecha_inicio       date        not null,
  fecha_vencimiento  date        not null,
  estado             text        not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'CUMPLIDO', 'VENCIDO')),
  tipo               text        not null default 'FATAL'
    check (tipo in ('FATAL', 'ORDINARIO')),
  triggered_by_act   jsonb       not null,
  is_auto_generated  boolean     not null default true,
  completed_at       timestamptz,
  completed_by       uuid        references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint case_deadlines_idempotency unique (case_file_id, act_type, fecha_inicio)
);

comment on table public.case_deadlines is
  'Plazos procesales generados automáticamente por el motor de plazos a partir de procedural_acts. '
  'is_auto_generated=true → regenerable; estado=CUMPLIDO con is_auto_generated=false → intocable.';

drop trigger if exists case_deadlines_updated_at on public.case_deadlines;
create trigger case_deadlines_updated_at
  before update on public.case_deadlines
  for each row execute function public.handle_updated_at();

alter table public.case_deadlines enable row level security;

drop policy if exists "case_deadlines_select" on public.case_deadlines;
create policy "case_deadlines_select" on public.case_deadlines
  for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

drop policy if exists "case_deadlines_all" on public.case_deadlines;
create policy "case_deadlines_all" on public.case_deadlines
  for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cd_case_file_id      on public.case_deadlines (case_file_id);
create index if not exists idx_cd_estado             on public.case_deadlines (estado);
create index if not exists idx_cd_fecha_vencimiento  on public.case_deadlines (fecha_vencimiento);
