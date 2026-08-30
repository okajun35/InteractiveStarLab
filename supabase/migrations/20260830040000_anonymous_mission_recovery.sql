-- Anonymous Mission recovery access for the POC.
-- The browser still receives an authenticated Supabase session, but no
-- no email/password login is required. The recovery code is returned once and
-- only its SHA-256 digest is stored.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter table public.observation_missions
  add column if not exists recovery_code_hash bytea;

create unique index if not exists observation_missions_recovery_code_hash_idx
  on public.observation_missions (recovery_code_hash);

create table if not exists public.observation_mission_access (
  mission_id text not null references public.observation_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create index if not exists observation_mission_access_user_id_idx
  on public.observation_mission_access(user_id, granted_at desc);

alter table public.observation_mission_access enable row level security;
revoke all on table public.observation_mission_access from anon, authenticated;

create or replace function private.has_observation_mission_access(
  p_mission_id text,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $function$
  select exists (
    select 1
    from public.observation_missions as mission
    where mission.id = p_mission_id
      and (
        mission.user_id = p_user_id
        or exists (
          select 1
          from public.observation_mission_access as access
          where access.mission_id = mission.id
            and access.user_id = p_user_id
        )
      )
  );
$function$;

revoke all on function private.has_observation_mission_access(text, uuid) from public, anon, authenticated;
grant execute on function private.has_observation_mission_access(text, uuid) to authenticated;

create or replace function public.create_observation_mission_with_recovery(
  p_id text,
  p_planned_at timestamptz,
  p_mission jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  actor uuid := auth.uid();
  mission_id text := trim(p_id);
  code_body text := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  recovery_code text;
  created public.observation_missions%rowtype;
begin
  if actor is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if mission_id = '' or length(mission_id) > 200 then
    raise exception using errcode = 'P0001', message = 'MISSION_INVALID';
  end if;
  if p_mission is null or jsonb_typeof(p_mission) <> 'object' or p_mission->>'id' <> mission_id then
    raise exception using errcode = 'P0001', message = 'MISSION_INVALID';
  end if;

  recovery_code := 'ISL-' ||
    substring(code_body from 1 for 4) || '-' ||
    substring(code_body from 5 for 4) || '-' ||
    substring(code_body from 9 for 4) || '-' ||
    substring(code_body from 13 for 4) || '-' ||
    substring(code_body from 17 for 4) || '-' ||
    substring(code_body from 21 for 4) || '-' ||
    substring(code_body from 25 for 4) || '-' ||
    substring(code_body from 29 for 4);

  insert into public.observation_missions (
    id,
    user_id,
    planned_at,
    mission,
    record,
    sky_snapshot,
    guide,
    recovery_code_hash
  ) values (
    mission_id,
    actor,
    p_planned_at,
    p_mission,
    null,
    null,
    null,
    extensions.digest(code_body, 'sha256')
  )
  returning * into created;

  insert into public.observation_mission_access (mission_id, user_id)
  values (created.id, actor)
  on conflict (mission_id, user_id) do nothing;

  return jsonb_build_object(
    'id', created.id,
    'user_id', created.user_id,
    'planned_at', created.planned_at,
    'mission', created.mission,
    'record', created.record,
    'sky_snapshot', created.sky_snapshot,
    'guide', created.guide,
    'created_at', created.created_at,
    'updated_at', created.updated_at,
    'recovery_code', recovery_code
  );
end;
$function$;

revoke all on function public.create_observation_mission_with_recovery(text, timestamptz, jsonb) from public, anon;
grant execute on function public.create_observation_mission_with_recovery(text, timestamptz, jsonb) to authenticated;

create or replace function public.restore_observation_mission(p_recovery_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  actor uuid := auth.uid();
  code_body text := regexp_replace(upper(trim(coalesce(p_recovery_code, ''))), '[[:space:]-]', '', 'g');
  restored_mission_id text;
begin
  if actor is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if left(code_body, 3) = 'ISL' then
    code_body := substring(code_body from 4);
  end if;
  if code_body !~ '^[0-9A-F]{32}$' then
    raise exception using errcode = 'P0001', message = 'RESTORE_CODE_INVALID';
  end if;

  select mission.id
    into restored_mission_id
    from public.observation_missions as mission
   where mission.recovery_code_hash = extensions.digest(code_body, 'sha256')
   limit 1;

  if restored_mission_id is null then
    raise exception using errcode = 'P0001', message = 'RESTORE_CODE_INVALID';
  end if;

  insert into public.observation_mission_access (mission_id, user_id)
  values (restored_mission_id, actor)
  on conflict (mission_id, user_id) do nothing;

  return restored_mission_id;
end;
$function$;

revoke all on function public.restore_observation_mission(text) from public, anon;
grant execute on function public.restore_observation_mission(text) to authenticated;

revoke all on table public.observation_missions from anon, authenticated;
grant select on table public.observation_missions to authenticated;
grant update (record, sky_snapshot, guide, updated_at) on table public.observation_missions to authenticated;
revoke insert on table public.observation_missions from authenticated;
revoke delete on table public.observation_missions from authenticated;

drop policy if exists "users select own observation missions" on public.observation_missions;
drop policy if exists "users insert own observation missions" on public.observation_missions;
drop policy if exists "users update own observation missions" on public.observation_missions;
drop policy if exists "mission members select" on public.observation_missions;
drop policy if exists "mission members update" on public.observation_missions;

create policy "mission members select"
on public.observation_missions
for select
to authenticated
using (private.has_observation_mission_access(id, (select auth.uid())));

create policy "mission members update"
on public.observation_missions
for update
to authenticated
using (private.has_observation_mission_access(id, (select auth.uid())))
with check (private.has_observation_mission_access(id, (select auth.uid())));

drop policy if exists "users insert own observation assets" on storage.objects;
drop policy if exists "users select own observation assets" on storage.objects;
drop policy if exists "mission members insert observation assets" on storage.objects;
drop policy if exists "mission members select observation assets" on storage.objects;

revoke all on table storage.objects from anon, authenticated;
grant select, insert on table storage.objects to authenticated;

create policy "mission members insert observation assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] is not null
  and private.has_observation_mission_access((storage.foldername(name))[1], (select auth.uid()))
);

create policy "mission members select observation assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] is not null
  and private.has_observation_mission_access((storage.foldername(name))[1], (select auth.uid()))
);
