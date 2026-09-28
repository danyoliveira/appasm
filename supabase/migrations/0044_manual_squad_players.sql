-- Players the coach adds to the squad by hand (a youth-team call-up, a
-- trialist, a signing API-Football hasn't picked up yet).
--
-- They get NEGATIVE ids from their own sequence, so they can never collide
-- with an API-Football player id (always positive) and every existing
-- player_id column (notes, injuries, availability, stats, dossier, …) works
-- for them unchanged. A player picked from an API search instead keeps
-- their real (positive) API id — nothing to merge later.
create sequence public.manual_player_id_seq start 1;

create table public.manual_squad_players (
  id integer primary key default -nextval('public.manual_player_id_seq')::integer,
  team_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  name text not null,
  position text not null check (position in ('Goalkeeper', 'Defender', 'Midfielder', 'Attacker')),
  number integer,
  birth_date date,
  nationality text,
  photo_url text,
  -- Set once the coach confirms this is the same person as an API player;
  -- the row is kept (not deleted) so old links can redirect.
  merged_into_player_id integer,
  merged_at timestamptz,
  created_at timestamptz not null default now()
);

create index manual_squad_players_team_idx on public.manual_squad_players (team_id, stint_id);

alter table public.manual_squad_players enable row level security;

create policy "manual_squad_players: authenticated read"
  on public.manual_squad_players for select
  using (auth.role() = 'authenticated');

create policy "manual_squad_players: coach inserts"
  on public.manual_squad_players for insert
  with check (public.is_coach());

create policy "manual_squad_players: coach updates"
  on public.manual_squad_players for update
  using (public.is_coach());

create policy "manual_squad_players: coach deletes"
  on public.manual_squad_players for delete
  using (public.is_coach());

-- "Não é o mesmo": a suggested (manual, API) pair the coach rejected, so the
-- merge suggestion doesn't keep coming back.
create table public.manual_player_merge_dismissals (
  manual_player_id integer not null references public.manual_squad_players (id) on delete cascade,
  api_player_id integer not null,
  created_at timestamptz not null default now(),
  primary key (manual_player_id, api_player_id)
);

alter table public.manual_player_merge_dismissals enable row level security;

create policy "manual_player_merge_dismissals: coach reads"
  on public.manual_player_merge_dismissals for select
  using (public.is_coach());

create policy "manual_player_merge_dismissals: coach inserts"
  on public.manual_player_merge_dismissals for insert
  with check (public.is_coach());

-- Moves everything recorded under the manual player's id over to the API
-- player's id, in one transaction. Where both ids already have a row in a
-- one-row-per-player table (availability, height, manual stats, archive
-- snapshot), the manual player's row wins — that's the data the coach
-- actually entered.
create or replace function public.merge_manual_player(p_manual_id integer, p_api_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coach() then
    raise exception 'not authorized';
  end if;
  if p_api_id is null or p_api_id <= 0 then
    raise exception 'invalid target player';
  end if;
  if not exists (
    select 1 from manual_squad_players
    where id = p_manual_id and merged_into_player_id is null
  ) then
    raise exception 'manual player not found';
  end if;

  delete from player_availability t
  where t.player_id = p_api_id
    and exists (
      select 1 from player_availability m
      where m.player_id = p_manual_id and m.team_id = t.team_id
        and m.stint_id is not distinct from t.stint_id
    );
  update player_availability set player_id = p_api_id where player_id = p_manual_id;

  delete from player_body_metrics t
  where t.player_id = p_api_id
    and exists (
      select 1 from player_body_metrics m
      where m.player_id = p_manual_id and m.team_id = t.team_id
        and m.stint_id is not distinct from t.stint_id
    );
  update player_body_metrics set player_id = p_api_id where player_id = p_manual_id;

  delete from player_manual_stats t
  where t.player_id = p_api_id
    and exists (
      select 1 from player_manual_stats m
      where m.player_id = p_manual_id and m.team_id = t.team_id
        and m.stint_id is not distinct from t.stint_id
    );
  update player_manual_stats set player_id = p_api_id where player_id = p_manual_id;

  delete from archived_squad_players t
  where t.player_id = p_api_id
    and exists (
      select 1 from archived_squad_players m
      where m.player_id = p_manual_id and m.stint_id = t.stint_id
    );
  update archived_squad_players set player_id = p_api_id where player_id = p_manual_id;

  update player_weight_log set player_id = p_api_id where player_id = p_manual_id;
  update player_injuries set player_id = p_api_id where player_id = p_manual_id;
  update player_notes set player_id = p_api_id where player_id = p_manual_id;
  update preparation_videos set player_id = p_api_id where player_id = p_manual_id;
  update team_dossier_files set player_id = p_api_id where player_id = p_manual_id;

  -- @mentions in club notes: the id array and the inline "@[Name](id)" token.
  update club_notes
  set mentioned_player_ids = array(
        select distinct unnest(array_replace(mentioned_player_ids, p_manual_id, p_api_id))
      ),
      content = replace(content, '](' || p_manual_id || ')', '](' || p_api_id || ')')
  where p_manual_id = any (mentioned_player_ids);

  update manual_squad_players
  set merged_into_player_id = p_api_id, merged_at = now()
  where id = p_manual_id;
end;
$$;

revoke all on function public.merge_manual_player(integer, integer) from public;
grant execute on function public.merge_manual_player(integer, integer) to authenticated;
