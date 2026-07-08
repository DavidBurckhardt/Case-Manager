-- Cases table
create table if not exists public.cases (
  id             uuid primary key default gen_random_uuid(),
  created_by     uuid not null references public.users(id) on delete restrict,
  assigned_to    uuid references public.users(id) on delete set null,
  case_number    text not null unique,
  caption        text not null,
  description    text,
  court          text,
  jurisdiction   text,
  case_type      text,
  status         text not null default 'active'
                   check (status in ('active', 'closed', 'archived', 'on_hold')),
  filed_at       date,
  closed_at      date,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

comment on table public.cases is 'Legal cases managed within the platform.';

drop trigger if exists cases_updated_at on public.cases;
create trigger cases_updated_at
  before update on public.cases
  for each row execute function public.handle_updated_at();

alter table public.cases enable row level security;

drop policy if exists "Users can view their own cases" on public.cases;
create policy "Users can view their own cases"
  on public.cases for select
  to authenticated
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "Users can create cases" on public.cases;
create policy "Users can create cases"
  on public.cases for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Owners and admins can update cases" on public.cases;
create policy "Owners and admins can update cases"
  on public.cases for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

drop policy if exists "Admins can delete cases" on public.cases;
create policy "Admins can delete cases"
  on public.cases for delete
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

create index if not exists idx_cases_case_number  on public.cases (case_number);
create index if not exists idx_cases_caption      on public.cases (caption);
create index if not exists idx_cases_court        on public.cases (court);
create index if not exists idx_cases_status       on public.cases (status);
create index if not exists idx_cases_created_by   on public.cases (created_by);
create index if not exists idx_cases_assigned_to  on public.cases (assigned_to);
create index if not exists idx_cases_created_at   on public.cases (created_at desc);
create index if not exists idx_cases_deleted_at   on public.cases (deleted_at) where deleted_at is null;
create index if not exists idx_cases_metadata     on public.cases using gin (metadata);
