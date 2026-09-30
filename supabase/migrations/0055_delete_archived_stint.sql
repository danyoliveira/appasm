-- Arquivo → "Apagar período": removes an ended coaching spell together with
-- everything that only exists because of it (the frozen squad, availability,
-- injuries, body metrics, manual stats, manual players, dossier files).
-- Several tables reference coaching_stints without "on delete cascade", so
-- it's done in one function (one transaction) instead of table by table
-- from the app.
--
-- Preparations (fixture_preparations, manual_preparations, tactics, videos,
-- Live Mode sessions) are NOT touched: they belong to the club, not to a
-- spell, and another spell at the same club may be showing them.
--
-- Returns the storage paths of the dossier files it removed, so the app can
-- delete the files themselves from the "team-dossier" bucket.
create or replace function public.delete_archived_stint(p_stint_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  dossier_paths text[];
begin
  if not public.is_coach() then
    raise exception 'Not authorized';
  end if;

  -- Only a spell that has ended — never the club being coached right now.
  if not exists (
    select 1 from public.coaching_stints where id = p_stint_id and ended_at is not null
  ) then
    raise exception 'Stint not found or still active';
  end if;

  select coalesce(array_agg(storage_path), '{}')
  into dossier_paths
  from public.team_dossier_files
  where stint_id = p_stint_id;

  delete from public.team_dossier_files where stint_id = p_stint_id;
  delete from public.player_availability where stint_id = p_stint_id;
  delete from public.player_body_metrics where stint_id = p_stint_id;
  delete from public.player_manual_stats where stint_id = p_stint_id;
  delete from public.player_injuries where stint_id = p_stint_id;
  delete from public.team_manual_stats where stint_id = p_stint_id;
  delete from public.manual_squad_players where stint_id = p_stint_id;
  -- archived_squad_players goes with the stint (on delete cascade).
  delete from public.coaching_stints where id = p_stint_id;

  return dossier_paths;
end;
$$;

revoke all on function public.delete_archived_stint(uuid) from public;
grant execute on function public.delete_archived_stint(uuid) to authenticated;
