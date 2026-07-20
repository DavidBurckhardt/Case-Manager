-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 26: Caducidad pasiva — last_activity_at en case_files
--
-- Hasta acá CADUCIDAD_INSTANCIA solo nacía si el LLM la extraía de un documento,
-- lo que deja ciego justo el caso que importa: el expediente que nadie tocó.
-- La caducidad del art. 310 CPCCN se produce por AUSENCIA de impulso, y una
-- ausencia no genera documentos que analizar.
--
-- Con last_activity_at el timer pasivo (AlertsService.checkPassiveCaducidad)
-- puede detectar el silencio y generar el plazo por su cuenta.
--
-- Default now() y no created_at: para los expedientes ya existentes no hay forma
-- de reconstruir la última actuación real, y arrancar el contador desde hoy
-- falla del lado seguro (a lo sumo avisa tarde, nunca declara una caducidad
-- que no ocurrió).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.case_files
  add column if not exists last_activity_at timestamptz not null default now();

comment on column public.case_files.last_activity_at is
  'Última actividad procesal: upload de documento o transición de estado. '
  'Usado para detectar caducidad pasiva (90 días hábiles sin impulso).';

-- El timer barre todos los expedientes activos en cada corrida del cron.
create index if not exists idx_cf_last_activity_at
  on public.case_files (last_activity_at)
  where deleted_at is null;
