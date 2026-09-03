-- 0030 and 0032 were edited to add stint_id *after* being run once already
-- (their first version used `primary key (team_id, player_id)`, no stint of
-- its own). This reconciles whatever's actually in the database with the
-- final shape in those files — every step is guarded so it's safe to run
-- no matter which version ended up applied, including if it's already
-- correct.

-- player_body_metrics
alter table public.player_body_metrics
  add column if not exists stint_id uuid references public.coaching_stints (id);

alter table public.player_body_metrics drop constraint if exists player_body_metrics_pkey;
alter table public.player_body_metrics drop constraint if exists player_body_metrics_team_id_player_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'player_body_metrics_team_id_player_id_stint_id_key'
  ) then
    alter table public.player_body_metrics
      add constraint player_body_metrics_team_id_player_id_stint_id_key
      unique (team_id, player_id, stint_id);
  end if;
end $$;

update public.player_body_metrics pbm
set stint_id = cs.id
from public.coaching_stints cs
where pbm.team_id = cs.team_id and pbm.stint_id is null and cs.ended_at is null;

-- player_manual_stats
alter table public.player_manual_stats
  add column if not exists stint_id uuid references public.coaching_stints (id);

alter table public.player_manual_stats drop constraint if exists player_manual_stats_pkey;
alter table public.player_manual_stats drop constraint if exists player_manual_stats_team_id_player_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'player_manual_stats_team_id_player_id_stint_id_key'
  ) then
    alter table public.player_manual_stats
      add constraint player_manual_stats_team_id_player_id_stint_id_key
      unique (team_id, player_id, stint_id);
  end if;
end $$;

update public.player_manual_stats pms
set stint_id = cs.id
from public.coaching_stints cs
where pms.team_id = cs.team_id and pms.stint_id is null and cs.ended_at is null;
