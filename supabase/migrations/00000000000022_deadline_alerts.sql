-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 22: Deadline alerts — tracking de alertas ya enviadas
--
-- El cron de alertas corre diariamente y recorre todos los plazos pendientes.
-- Esta tabla registra qué alerta (T10/T5/T2/T0) ya se envió para cada plazo,
-- de modo que una segunda corrida el mismo día (o un retry) no reenvíe mails.
-- La unique(deadline_id, alert_type) es la garantía de idempotencia.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.deadline_alerts (
  id          uuid        primary key default gen_random_uuid(),
  deadline_id uuid        not null references public.case_deadlines(id) on delete cascade,
  alert_type  text        not null check (alert_type in ('T10', 'T5', 'T2', 'T0')),
  sent_at     timestamptz not null default now(),
  constraint deadline_alerts_once unique (deadline_id, alert_type)
);

comment on table public.deadline_alerts is
  'Registro de alertas de vencimiento ya enviadas por el cron. '
  'unique(deadline_id, alert_type) evita reenvíos en corridas repetidas.';

alter table public.deadline_alerts enable row level security;

-- Solo lectura para el usuario que tiene acceso al caso padre del plazo.
-- Las escrituras las hace el backend con service_role (bypass RLS).
drop policy if exists "deadline_alerts_select" on public.deadline_alerts;
create policy "deadline_alerts_select" on public.deadline_alerts
  for select to authenticated
  using (exists (
    select 1
    from public.case_deadlines cd
    join public.case_files cf on cf.id = cd.case_file_id
    where cd.id = deadline_id
      and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_deadline_alerts_deadline_id on public.deadline_alerts (deadline_id);
