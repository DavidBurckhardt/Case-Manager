-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 19: Deadline engine — tabla judicial_holidays
--
-- Catálogo de feriados judiciales argentinos (solo lectura para authenticated).
-- Incluye feriados nacionales inamovibles + feria judicial enero/julio.
-- Los feriados móviles/puente están marcados con -- VERIFICAR.
-- Las fechas exactas de feria judicial deben confirmarse con el TSJ cada año.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.judicial_holidays (
  id         uuid        primary key default gen_random_uuid(),
  date       date        not null,
  name       text        not null,
  type       text        not null check (type in ('nacional', 'feria_enero', 'feria_julio')),
  created_at timestamptz not null default now(),
  constraint judicial_holidays_date_unique unique (date)
);

drop trigger if exists judicial_holidays_updated_at on public.judicial_holidays;
-- nota: tabla de catálogo sin updated_at (filas no se actualizan, solo insert)

alter table public.judicial_holidays enable row level security;

-- authenticated puede leer (catálogo público de solo lectura)
drop policy if exists "judicial_holidays_select" on public.judicial_holidays;
create policy "judicial_holidays_select" on public.judicial_holidays
  for select to authenticated using (true);

-- service_role mantiene acceso completo vía bypass RLS (comportamiento por defecto en Supabase)

create index if not exists idx_judicial_holidays_date on public.judicial_holidays (date);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feriados nacionales inamovibles 2026 y 2027
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.judicial_holidays (date, name, type) values
  -- 2026 ── inamovibles
  ('2026-01-01', 'Año Nuevo',                                           'nacional'),
  ('2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional'),
  ('2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'nacional'),
  ('2026-05-01', 'Día del Trabajador',                                  'nacional'),
  ('2026-05-25', 'Día de la Revolución de Mayo',                        'nacional'),
  ('2026-07-09', 'Día de la Independencia',                             'nacional'),
  ('2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín',         'nacional'), -- VERIFICAR: puede ser trasladado al lunes más cercano
  ('2026-10-12', 'Día del Respeto a la Diversidad Cultural',            'nacional'), -- VERIFICAR: puede ser trasladado
  ('2026-11-20', 'Día de la Soberanía Nacional',                        'nacional'), -- VERIFICAR: puede ser trasladado al lunes más cercano
  ('2026-12-08', 'Inmaculada Concepción de María',                      'nacional'),
  ('2026-12-25', 'Navidad',                                             'nacional'),

  -- 2026 ── móviles / puente (VERIFICAR cada año por decreto del PEN)
  ('2026-02-16', 'Carnaval',                                            'nacional'), -- VERIFICAR
  ('2026-02-17', 'Carnaval',                                            'nacional'), -- VERIFICAR
  ('2026-04-02', 'Jueves Santo',                                        'nacional'), -- VERIFICAR — colisiona con Malvinas; ajustar si es necesario
  ('2026-04-03', 'Viernes Santo',                                       'nacional'), -- VERIFICAR

  -- 2027 ── inamovibles
  ('2027-01-01', 'Año Nuevo',                                           'nacional'),
  ('2027-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional'),
  ('2027-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'nacional'),
  ('2027-05-01', 'Día del Trabajador',                                  'nacional'),
  ('2027-05-25', 'Día de la Revolución de Mayo',                        'nacional'),
  ('2027-07-09', 'Día de la Independencia',                             'nacional'),
  ('2027-08-17', 'Paso a la Inmortalidad del Gral. San Martín',         'nacional'), -- VERIFICAR
  ('2027-10-12', 'Día del Respeto a la Diversidad Cultural',            'nacional'), -- VERIFICAR
  ('2027-11-22', 'Día de la Soberanía Nacional',                        'nacional'), -- VERIFICAR: trasladado al lunes más cercano
  ('2027-12-08', 'Inmaculada Concepción de María',                      'nacional'),
  ('2027-12-25', 'Navidad',                                             'nacional'),

  -- 2027 ── móviles / puente (VERIFICAR cada año por decreto del PEN)
  ('2027-02-08', 'Carnaval',                                            'nacional'), -- VERIFICAR
  ('2027-02-09', 'Carnaval',                                            'nacional'), -- VERIFICAR
  ('2027-03-25', 'Jueves Santo',                                        'nacional'), -- VERIFICAR
  ('2027-03-26', 'Viernes Santo',                                       'nacional')  -- VERIFICAR

on conflict (date) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feria judicial enero 2026 (días 1-31)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.judicial_holidays (date, name, type)
select
  ('2026-01-01'::date + (n - 1) * interval '1 day')::date,
  'Feria judicial enero 2026',
  'feria_enero'
from generate_series(1, 31) as gs(n)
on conflict (date) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feria judicial enero 2027 (días 1-31)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.judicial_holidays (date, name, type)
select
  ('2027-01-01'::date + (n - 1) * interval '1 day')::date,
  'Feria judicial enero 2027',
  'feria_enero'
from generate_series(1, 31) as gs(n)
on conflict (date) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feria judicial julio 2026 (aprox 1-17 jul) -- VERIFICAR fechas exactas del TSJ
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.judicial_holidays (date, name, type)
select
  ('2026-07-01'::date + (n - 1) * interval '1 day')::date,
  'Feria judicial julio 2026',
  'feria_julio'
from generate_series(1, 17) as gs(n)
on conflict (date) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: feria judicial julio 2027 (aprox 1-17 jul) -- VERIFICAR fechas exactas del TSJ
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.judicial_holidays (date, name, type)
select
  ('2027-07-01'::date + (n - 1) * interval '1 day')::date,
  'Feria judicial julio 2027',
  'feria_julio'
from generate_series(1, 17) as gs(n)
on conflict (date) do nothing;
