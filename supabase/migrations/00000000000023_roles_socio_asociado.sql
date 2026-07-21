-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 23: Roles SOCIO / ASOCIADO
--
-- Reemplaza los roles genéricos ('user', 'viewer') por el modelo del estudio:
--
--   admin    — acceso total + gestión de usuarios
--   socio    — ve TODOS los expedientes del estudio, asigna casos
--   asociado — ve solo los expedientes donde es responsable o creador
--
-- Las políticas RLS no cascadean: cada tabla satélite (plaintiff, accident,
-- medical, …) re-evalúa el acceso por su cuenta. Si solo se cambiara la
-- política de case_files, un socio vería la fila del expediente pero ninguno
-- de sus detalles. Por eso esta migración reescribe las 20 políticas que
-- contienen el chequeo de acceso al caso.
--
-- Para no repetir la condición veinte veces se introduce can_access_case():
-- un único punto de edición para el próximo cambio de reglas de acceso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Roles ────────────────────────────────────────────────────────────────────

alter table public.users drop constraint if exists users_role_check;

-- Migrar ANTES de aplicar el nuevo check, o las filas viejas lo violan.
update public.users set role = 'asociado' where role in ('user', 'viewer');

alter table public.users
  add constraint users_role_check check (role in ('admin', 'socio', 'asociado'));

-- El trigger handle_new_auth_user() inserta sin especificar role, así que el
-- default es lo que reciben todos los usuarios nuevos.
alter table public.users alter column role set default 'asociado';

comment on column public.users.role is
  'admin = acceso total + gestión de usuarios; socio = ve todo el estudio; asociado = solo sus expedientes.';

-- ── Funciones de acceso ──────────────────────────────────────────────────────
-- SECURITY DEFINER por el mismo motivo que is_admin() (ver migración 12):
-- ejecutar como owner evita que la consulta interna re-entre en la evaluación
-- de políticas y dispare "infinite recursion" (42P17).

create or replace function public.has_firm_wide_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('admin', 'socio')
  );
$$;

comment on function public.has_firm_wide_access() is
  'True para admin y socio: roles que ven todos los expedientes del estudio.';

create or replace function public.can_access_case(cf_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.case_files cf
    where cf.id = cf_id
      and cf.deleted_at is null
      and (
        cf.created_by = auth.uid()
        or cf.responsible_attorney_id = auth.uid()
        or public.has_firm_wide_access()
      )
  );
$$;

comment on function public.can_access_case(uuid) is
  'Acceso a un expediente: creador, abogado responsable, o rol con alcance de estudio. '
  'Punto único de verdad — las políticas de las tablas satélite delegan acá.';

-- ── public.users ─────────────────────────────────────────────────────────────
-- El socio necesita listar usuarios para asignar expedientes.

drop policy if exists "Admins can view all users" on public.users;
create policy "Admins can view all users"
  on public.users for select
  to authenticated
  using (public.has_firm_wide_access());

-- ── public.case_files ────────────────────────────────────────────────────────

drop policy if exists "Users can view accessible case files" on public.case_files;
create policy "Users can view accessible case files"
  on public.case_files for select
  to authenticated
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or responsible_attorney_id = auth.uid()
      or public.has_firm_wide_access()
    )
  );

drop policy if exists "Owners and admins can update case files" on public.case_files;
create policy "Owners and admins can update case files"
  on public.case_files for update
  to authenticated
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or responsible_attorney_id = auth.uid()
      or public.has_firm_wide_access()
    )
  )
  with check (updated_by = auth.uid());

-- ── public.case_file_parties ─────────────────────────────────────────────────

drop policy if exists "Case file parties visible to case members" on public.case_file_parties;
create policy "Case file parties visible to case members"
  on public.case_file_parties for select
  to authenticated
  using (public.can_access_case(case_file_id));

drop policy if exists "Case members can manage parties" on public.case_file_parties;
create policy "Case members can manage parties"
  on public.case_file_parties for all
  to authenticated
  using (public.can_access_case(case_file_id));

-- ── public.case_file_documents ───────────────────────────────────────────────
-- Preserva la lógica de inbox: documento sin caso asignado sigue siendo
-- visible solo para quien lo subió.

drop policy if exists "Case members can view documents" on public.case_file_documents;
create policy "Case members can view documents"
  on public.case_file_documents for select
  to authenticated
  using (
    deleted_at is null
    and (
      (case_file_id is null and uploaded_by = auth.uid())
      or (case_file_id is not null and public.can_access_case(case_file_id))
    )
  );

-- ── Tablas satélite (migración 13) ───────────────────────────────────────────

drop policy if exists "case_file_plaintiff_select" on public.case_file_plaintiff;
create policy "case_file_plaintiff_select" on public.case_file_plaintiff
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_plaintiff_all" on public.case_file_plaintiff;
create policy "case_file_plaintiff_all" on public.case_file_plaintiff
  for all to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_accident_select" on public.case_file_accident;
create policy "case_file_accident_select" on public.case_file_accident
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_accident_all" on public.case_file_accident;
create policy "case_file_accident_all" on public.case_file_accident
  for all to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_medical_select" on public.case_file_medical;
create policy "case_file_medical_select" on public.case_file_medical
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_medical_all" on public.case_file_medical;
create policy "case_file_medical_all" on public.case_file_medical
  for all to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_insurance_select" on public.case_file_insurance;
create policy "case_file_insurance_select" on public.case_file_insurance
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_insurance_all" on public.case_file_insurance;
create policy "case_file_insurance_all" on public.case_file_insurance
  for all to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_employer_select" on public.case_file_employer;
create policy "case_file_employer_select" on public.case_file_employer
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_employer_all" on public.case_file_employer;
create policy "case_file_employer_all" on public.case_file_employer
  for all to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_admin_proc_select" on public.case_file_admin_proceedings;
create policy "case_file_admin_proc_select" on public.case_file_admin_proceedings
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_file_admin_proc_all" on public.case_file_admin_proceedings;
create policy "case_file_admin_proc_all" on public.case_file_admin_proceedings
  for all to authenticated using (public.can_access_case(case_file_id));

-- ── public.case_deadlines (migración 20) ─────────────────────────────────────

drop policy if exists "case_deadlines_select" on public.case_deadlines;
create policy "case_deadlines_select" on public.case_deadlines
  for select to authenticated using (public.can_access_case(case_file_id));

drop policy if exists "case_deadlines_all" on public.case_deadlines;
create policy "case_deadlines_all" on public.case_deadlines
  for all to authenticated using (public.can_access_case(case_file_id));

-- ── public.deadline_alerts (migración 22) ────────────────────────────────────

drop policy if exists "deadline_alerts_select" on public.deadline_alerts;
create policy "deadline_alerts_select" on public.deadline_alerts
  for select to authenticated
  using (exists (
    select 1 from public.case_deadlines cd
    where cd.id = deadline_id
      and public.can_access_case(cd.case_file_id)
  ));
