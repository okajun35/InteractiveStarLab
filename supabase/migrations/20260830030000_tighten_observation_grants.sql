-- Tighten client grants and make auth lookups stable in RLS policies.

revoke all on table public.observation_missions from anon, authenticated;
grant select, insert, update on table public.observation_missions to authenticated;

revoke all on table storage.objects from anon, authenticated;
grant select, insert on table storage.objects to authenticated;

drop policy if exists "users select own observation missions" on public.observation_missions;
create policy "users select own observation missions"
on public.observation_missions
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "users insert own observation missions" on public.observation_missions;
create policy "users insert own observation missions"
on public.observation_missions
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "users update own observation missions" on public.observation_missions;
create policy "users update own observation missions"
on public.observation_missions
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "users insert own observation assets" on storage.objects;
create policy "users insert own observation assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "users select own observation assets" on storage.objects;
create policy "users select own observation assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'observation-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
