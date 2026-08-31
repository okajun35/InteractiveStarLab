-- Fix the create RPC's PL/pgSQL variable named mission_id. PostgreSQL also
-- resolves mission_id in the ON CONFLICT target as a table column, so the
-- first runtime call failed with an ambiguous-column error. Keep the public
-- invoker wrapper and replace only its private implementation.

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
  mission_key text := trim(p_id);
  code_body text := upper(encode(extensions.gen_random_bytes(16), 'hex'));
  recovery_code text;
  created public.observation_missions%rowtype;
begin
  if actor is null then
    raise exception using errcode = 'P0001', message = 'AUTH_REQUIRED';
  end if;
  if mission_key = '' or length(mission_key) > 200 then
    raise exception using errcode = 'P0001', message = 'MISSION_INVALID';
  end if;
  if p_mission is null or jsonb_typeof(p_mission) <> 'object' or p_mission->>'id' <> mission_key then
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
    mission_key,
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
