-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 13: Expand case schema to match rich LLM extraction output
--
-- CLEAN SLATE: all existing case/document data is wiped so we can reshape
-- the schema without complex data-migration logic.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Wipe dependent data first (FK order)
truncate public.case_file_parties   restart identity cascade;
truncate public.case_file_documents restart identity cascade;
truncate public.case_files          restart identity cascade;

-- 2. Expand case_files with new extracted fields
--    Existing columns kept: id, case_number, caption (→ title), court,
--    jurisdiction, clerk_office, matter, current_status_id, etc.

alter table public.case_files
  -- Rename caption to title semantically (caption kept as alias)
  add column if not exists title            text,
  add column if not exists department       text,
  add column if not exists process_type     text,
  add column if not exists legal_matter     text,
  add column if not exists filing_date      date,
  add column if not exists claim_amount     numeric(18, 2),
  add column if not exists summary          text,
  add column if not exists confidence_overall text
    check (confidence_overall in ('High', 'Medium', 'Low')),
  add column if not exists confidence_missing_fields jsonb default '[]'::jsonb,
  add column if not exists documents_detected        jsonb default '[]'::jsonb,
  add column if not exists important_dates           jsonb default '[]'::jsonb,
  add column if not exists legal_claim               jsonb default '{}'::jsonb;

-- 3. Extend case_file_parties: add cuit + party_category + drop old role check
--    so we can add 'lawyer' to the allowed set
alter table public.case_file_parties
  add column if not exists cuit          text,
  add column if not exists party_type    text;   -- e.g. "ART", "company", "individual"

-- Drop old role check and replace with one that includes 'lawyer'
alter table public.case_file_parties
  drop constraint if exists case_file_parties_role_check;

alter table public.case_file_parties
  add constraint case_file_parties_role_check
    check (role in (
      'plaintiff', 'defendant', 'third_party',
      'appellant', 'respondent', 'witness', 'lawyer', 'other'
    ));

-- ─── 4. New satellite tables ─────────────────────────────────────────────────

-- Plaintiff (one-to-one with case_files)
create table if not exists public.case_file_plaintiff (
  id            uuid primary key default gen_random_uuid(),
  case_file_id  uuid not null unique references public.case_files(id) on delete cascade,
  full_name     text,
  dni           text,
  cuil          text,
  birth_date    date,
  nationality   text,
  marital_status text,
  address       text,
  city          text,
  province      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists case_file_plaintiff_updated_at on public.case_file_plaintiff;
create trigger case_file_plaintiff_updated_at
  before update on public.case_file_plaintiff
  for each row execute function public.handle_updated_at();

alter table public.case_file_plaintiff enable row level security;

create policy "case_file_plaintiff_select" on public.case_file_plaintiff for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_plaintiff_all" on public.case_file_plaintiff for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfp_case_file_id on public.case_file_plaintiff (case_file_id);
create index if not exists idx_cfp_dni          on public.case_file_plaintiff (dni)  where dni is not null;
create index if not exists idx_cfp_cuil         on public.case_file_plaintiff (cuil) where cuil is not null;

-- Accident (one-to-one with case_files)
create table if not exists public.case_file_accident (
  id            uuid primary key default gen_random_uuid(),
  case_file_id  uuid not null unique references public.case_files(id) on delete cascade,
  accident_type text,
  accident_date date,
  accident_time text,
  location      text,
  province      text,
  city          text,
  description   text,
  work_activity text,
  mechanism     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists case_file_accident_updated_at on public.case_file_accident;
create trigger case_file_accident_updated_at
  before update on public.case_file_accident
  for each row execute function public.handle_updated_at();

alter table public.case_file_accident enable row level security;

create policy "case_file_accident_select" on public.case_file_accident for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_accident_all" on public.case_file_accident for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfa_case_file_id   on public.case_file_accident (case_file_id);
create index if not exists idx_cfa_accident_date  on public.case_file_accident (accident_date) where accident_date is not null;

-- Medical (one-to-one; arrays stored as JSONB)
create table if not exists public.case_file_medical (
  id                           uuid primary key default gen_random_uuid(),
  case_file_id                 uuid not null unique references public.case_files(id) on delete cascade,
  diagnosis                    jsonb not null default '[]'::jsonb,
  affected_body_parts          jsonb not null default '[]'::jsonb,
  medical_leave_start          date,
  medical_discharge_date       date,
  surgeries                    jsonb not null default '[]'::jsonb,
  treatments                   jsonb not null default '[]'::jsonb,
  current_limitations          jsonb not null default '[]'::jsonb,
  psychological_damage_claimed boolean not null default false,
  permanent_disability         text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

drop trigger if exists case_file_medical_updated_at on public.case_file_medical;
create trigger case_file_medical_updated_at
  before update on public.case_file_medical
  for each row execute function public.handle_updated_at();

alter table public.case_file_medical enable row level security;

create policy "case_file_medical_select" on public.case_file_medical for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_medical_all" on public.case_file_medical for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfm_case_file_id on public.case_file_medical (case_file_id);

-- Insurance company (ART)
create table if not exists public.case_file_insurance (
  id            uuid primary key default gen_random_uuid(),
  case_file_id  uuid not null unique references public.case_files(id) on delete cascade,
  name          text,
  cuit          text,
  claim_number  text,
  policy_number text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists case_file_insurance_updated_at on public.case_file_insurance;
create trigger case_file_insurance_updated_at
  before update on public.case_file_insurance
  for each row execute function public.handle_updated_at();

alter table public.case_file_insurance enable row level security;

create policy "case_file_insurance_select" on public.case_file_insurance for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_insurance_all" on public.case_file_insurance for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfi_case_file_id on public.case_file_insurance (case_file_id);

-- Employer
create table if not exists public.case_file_employer (
  id            uuid primary key default gen_random_uuid(),
  case_file_id  uuid not null unique references public.case_files(id) on delete cascade,
  company_name  text,
  cuit          text,
  activity      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists case_file_employer_updated_at on public.case_file_employer;
create trigger case_file_employer_updated_at
  before update on public.case_file_employer
  for each row execute function public.handle_updated_at();

alter table public.case_file_employer enable row level security;

create policy "case_file_employer_select" on public.case_file_employer for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_employer_all" on public.case_file_employer for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfe_case_file_id on public.case_file_employer (case_file_id);

-- Administrative proceedings
create table if not exists public.case_file_admin_proceedings (
  id                       uuid primary key default gen_random_uuid(),
  case_file_id             uuid not null unique references public.case_files(id) on delete cascade,
  medical_commission_case  text,
  medical_commission       text,
  resolution_date          date,
  medical_opinion          text,
  administrative_status    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

drop trigger if exists case_file_admin_proc_updated_at on public.case_file_admin_proceedings;
create trigger case_file_admin_proc_updated_at
  before update on public.case_file_admin_proceedings
  for each row execute function public.handle_updated_at();

alter table public.case_file_admin_proceedings enable row level security;

create policy "case_file_admin_proc_select" on public.case_file_admin_proceedings for select to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create policy "case_file_admin_proc_all" on public.case_file_admin_proceedings for all to authenticated
  using (exists (
    select 1 from public.case_files cf
    where cf.id = case_file_id and cf.deleted_at is null
      and (cf.created_by = auth.uid() or cf.responsible_attorney_id = auth.uid() or public.is_admin())
  ));

create index if not exists idx_cfap_case_file_id on public.case_file_admin_proceedings (case_file_id);
