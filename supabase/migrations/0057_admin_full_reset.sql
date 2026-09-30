-- Perfil → Utilização → "zona de perigo": a full factory reset, used once
-- before going live in production (and, if ever needed again, to start
-- completely fresh). Empties every table in the public schema — profiles,
-- invites, every club/game/preparation table, cache, everything — in one
-- shot, without having to keep this list in sync with future migrations.
--
-- Deliberately NOT gated by public.is_coach(): that reads auth.uid(), which
-- is null for the service-role caller this is meant for (no user JWT in a
-- service-role request). The real authorization happens twice instead:
-- the Next.js server action checks the caller is the coach (with the
-- caller's own session) before ever invoking this, and the grants below
-- make sure only the service-role connection can call it at all — a normal
-- authenticated session (coach included) gets a permission error.
--
-- Storage files (avatars, team-dossier PDFs) are NOT touched here — those
-- live outside the public schema and are removed via the Storage API from
-- the server action, which actually deletes the underlying files instead of
-- just their catalog rows. Auth users are removed the same way, via
-- supabase.auth.admin.deleteUser, not from SQL.
create or replace function public.admin_reset_all_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
  into table_list
  from pg_tables
  where schemaname = 'public';

  if table_list is not null then
    execute format('truncate table %s restart identity cascade', table_list);
  end if;
end;
$$;

revoke all on function public.admin_reset_all_data() from public, anon, authenticated;
grant execute on function public.admin_reset_all_data() to service_role;
