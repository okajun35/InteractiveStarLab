-- InteractiveStarLab cloud observation persistence.
-- The JSON columns intentionally preserve the existing domain objects while
-- keeping the deadline MVP to one relational table.

create table if not exists public.observation_missions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  planned_at timestamptz not null,
  mission jsonb not null,
  record jsonb,
  sky_snapshot jsonb,
  guide jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists observation_missions_user_planned_at_idx
  on public.observation_missions(user_id, planned_at desc);

alter table public.observation_missions enable row level security;

revoke all on table public.observation_missions from anon;
grant select, insert, update on table public.observation_missions to authenticated;

drop policy if exists "users select own observation missions" on public.observation_missions;
create policy "users select own observation missions"
on public.observation_missions
for select
to authenticated
using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users insert own observation missions" on public.observation_missions;
create policy "users insert own observation missions"
on public.observation_missions
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users update own observation missions" on public.observation_missions;
create policy "users update own observation missions"
on public.observation_missions
for update
to authenticated
using (auth.uid() is not null and auth.uid() = user_id)
with check (auth.uid() is not null and auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('observation-assets', 'observation-assets', false)
on conflict (id) do update set public = false;

drop policy if exists "users insert own observation assets" on storage.objects;
create policy "users insert own observation assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users select own observation assets" on storage.objects;
create policy "users select own observation assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
