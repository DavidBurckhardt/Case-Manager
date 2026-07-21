-- ─────────────────────────────────────────────────────────────────────────────
-- seed_demo_socio_user.sql — Usuario SOCIO de demostración
--
-- Crea el usuario demo en auth.users + auth.identities, replicando lo que hace
-- GoTrue en un signup con email/password ya confirmado. Se inserta a mano
-- porque el entorno de desarrollo no siempre tiene la service_role key a mano
-- para pegarle al endpoint de admin de Auth.
--
-- Correr ANTES de seed_demo_socio.sql:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed_demo_socio_user.sql
--
-- SOLO PARA DESARROLLO: la contraseña está en claro en este archivo.
--
-- Idempotente: si el email ya existe, no lo recrea y solo re-aplica el rol.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = 'socio.demo@brainlab.test';

  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'socio.demo@brainlab.test', crypt('BrainLab2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Dr. Martín Pérez (Demo)"}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text, 'email',
      json_build_object('sub', v_uid::text, 'email', 'socio.demo@brainlab.test',
                        'email_verified', true, 'phone_verified', false)::jsonb,
      now(), now(), now()
    );

    raise notice 'auth.users creado: %', v_uid;
  else
    raise notice 'auth.users ya existía: %', v_uid;
  end if;

  -- El trigger handle_new_auth_user() ya insertó la fila en public.users.
  update public.users
     set role = 'socio', full_name = 'Dr. Martín Pérez (Demo)', is_active = true
   where id = v_uid;
end $$;

select id, email, role, full_name from public.users where email = 'socio.demo@brainlab.test';
