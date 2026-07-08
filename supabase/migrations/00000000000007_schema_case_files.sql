-- Workflow States
create table if not exists public.workflow_states (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  description text,
  is_terminal boolean not null default false,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.workflow_states is 'Catalogue of procedural states for the workflow engine.';

insert into public.workflow_states (code, label, sort_order, is_terminal) values
  ('initial_filing',       'Initial Filing',            10,  false),
  ('service_of_process',   'Service of Process',        20,  false),
  ('answer_period',        'Answer Period',              30,  false),
  ('preliminary_hearing',  'Preliminary Hearing',        40,  false),
  ('evidentiary_period',   'Evidentiary Period',         50,  false),
  ('closing_arguments',    'Closing Arguments',          60,  false),
  ('judgment',             'Judgment',                   70,  false),
  ('appeal',               'Appeal',                     80,  false),
  ('enforcement',          'Enforcement',                90,  false),
  ('closed',               'Closed',                    100,  true),
  ('archived',             'Archived',                  110,  true)
on conflict (code) do nothing;

alter table public.workflow_states enable row level security;

drop policy if exists "All authenticated users can read workflow states" on public.workflow_states;
create policy "All authenticated users can read workflow states"
  on public.workflow_states for select
  to authenticated
  using (true);

-- Case Files (Expedientes)
create table if not exists public.case_files (
  id                     uuid primary key default gen_random_uuid(),
  case_number            text not null,
  caption                text not null,
  jurisdiction           text,
  court                  text,
  clerk_office           text,
  matter                 text,
  current_status_id      uuid not null
                           references public.workflow_states(id) on delete restrict,
  responsible_attorney_id uuid references public.users(id) on delete set null,
  created_by             uuid not null references public.users(id) on delete restrict,
  updated_by             uuid not null references public.users(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz,
  deleted_by             uuid references public.users(id) on delete set null,
  constraint uq_case_files_case_number_active
    unique nulls not distinct (case_number, deleted_at)
);

comment on table public.case_files is 'Central case file (expediente) entity.';

drop trigger if exists case_files_updated_at on public.case_files;
create trigger case_files_updated_at
  before update on public.case_files
  for each row execute function public.handle_updated_at();

alter table public.case_files enable row level security;

drop policy if exists "Users can view accessible case files" on public.case_files;
create policy "Users can view accessible case files"
  on public.case_files for select
  to authenticated
  using (
    deleted_at is null
    and (
      created_by              = auth.uid()
      or responsible_attorney_id = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  );

drop policy if exists "Authenticated users can create case files" on public.case_files;
create policy "Authenticated users can create case files"
  on public.case_files for insert
  to authenticated
  with check (created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists "Owners and admins can update case files" on public.case_files;
create policy "Owners and admins can update case files"
  on public.case_files for update
  to authenticated
  using (
    deleted_at is null
    and (
      created_by = auth.uid()
      or responsible_attorney_id = auth.uid()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.role = 'admin'
      )
    )
  )
  with check (updated_by = auth.uid());

create index if not exists idx_case_files_case_number    on public.case_files (case_number)  where deleted_at is null;
create index if not exists idx_case_files_caption        on public.case_files (caption)      where deleted_at is null;
create index if not exists idx_case_files_court          on public.case_files (court)        where deleted_at is null;
create index if not exists idx_case_files_matter         on public.case_files (matter)       where deleted_at is null;
create index if not exists idx_case_files_jurisdiction   on public.case_files (jurisdiction) where deleted_at is null;
create index if not exists idx_case_files_status         on public.case_files (current_status_id);
create index if not exists idx_case_files_attorney       on public.case_files (responsible_attorney_id);
create index if not exists idx_case_files_created_by     on public.case_files (created_by);
create index if not exists idx_case_files_created_at     on public.case_files (created_at desc);
create index if not exists idx_case_files_deleted_at     on public.case_files (deleted_at) where deleted_at is null;

-- Case File Parties
create table if not exists public.case_file_parties (
  id           uuid primary key default gen_random_uuid(),
  case_file_id uuid not null references public.case_files(id) on delete cascade,
  name         text not null,
  role         text not null
                 check (role in (
                   'plaintiff', 'defendant', 'third_party',
                   'appellant', 'respondent', 'witness', 'other'
                 )),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.case_file_parties is 'Parties involved in a case file.';

drop trigger if exists case_file_parties_updated_at on public.case_file_parties;
create trigger case_file_parties_updated_at
  before update on public.case_file_parties
  for each row execute function public.handle_updated_at();

alter table public.case_file_parties enable row level security;

drop policy if exists "Case file parties visible to case members" on public.case_file_parties;
create policy "Case file parties visible to case members"
  on public.case_file_parties for select
  to authenticated
  using (
    exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by              = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );

drop policy if exists "Case members can manage parties" on public.case_file_parties;
create policy "Case members can manage parties"
  on public.case_file_parties for all
  to authenticated
  using (
    exists (
      select 1 from public.case_files cf
      where cf.id = case_file_id
        and cf.deleted_at is null
        and (
          cf.created_by = auth.uid()
          or cf.responsible_attorney_id = auth.uid()
          or exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.role = 'admin'
          )
        )
    )
  );

create index if not exists idx_case_file_parties_case_file_id on public.case_file_parties (case_file_id);
create index if not exists idx_case_file_parties_role         on public.case_file_parties (role);
