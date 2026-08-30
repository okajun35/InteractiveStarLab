-- Keep the public RPC surface invoker-only. The implementation functions are
-- intentionally private so the API linter does not expose a broad definer
-- function through the public schema.

drop policy if exists "no direct mission access grants" on public.observation_mission_access;
create policy "no direct mission access grants"
on public.observation_mission_access
for all
to authenticated
using (false)
with check (false);

create or replace function private.create_observation_mission_with_recovery(
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
    id, user_id, planned_at, mission, record, sky_snapshot, guide, recovery_code_hash
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

create or replace function private.restore_observation_mission(p_recovery_code text)
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

revoke all on function private.create_observation_mission_with_recovery(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.create_observation_mission_with_recovery(text, timestamptz, jsonb) to authenticated;
revoke all on function private.restore_observation_mission(text) from public, anon, authenticated;
grant execute on function private.restore_observation_mission(text) to authenticated;

create or replace function public.create_observation_mission_with_recovery(
  p_id text,
  p_planned_at timestamptz,
  p_mission jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, extensions
as $function$
  select private.create_observation_mission_with_recovery(p_id, p_planned_at, p_mission);
$function$;

create or replace function public.restore_observation_mission(p_recovery_code text)
returns text
language sql
security invoker
set search_path = public, extensions
as $function$
  select private.restore_observation_mission(p_recovery_code);
$function$;

revoke all on function public.create_observation_mission_with_recovery(text, timestamptz, jsonb) from public, anon;
grant execute on function public.create_observation_mission_with_recovery(text, timestamptz, jsonb) to authenticated;
revoke all on function public.restore_observation_mission(text) from public, anon;
grant execute on function public.restore_observation_mission(text) to authenticated;
