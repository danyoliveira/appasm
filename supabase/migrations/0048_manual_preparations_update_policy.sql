-- manual_preparations never had an UPDATE policy (only select/insert/delete),
-- so the "Editar" form on a manual game — date, opponent, competition,
-- venue, score — was silently a no-op: RLS filtered the row out and the
-- update affected nothing, without an error.
create policy "manual_preparations: coach updates"
  on public.manual_preparations for update
  using (public.is_coach())
  with check (public.is_coach());

-- Manual games already played in ASM Live Mode before the final score was
-- carried over automatically at full time: fill in the score from the
-- goals logged there (only where no score was entered by hand).
with scores as (
  select distinct on (ls.preparation_key)
    ls.preparation_key,
    (select count(*) from public.live_match_entries e
      where e.session_id = ls.id and e.kind = 'event' and e.event_type = 'goal' and e.team_side = 'home') as home_goals,
    (select count(*) from public.live_match_entries e
      where e.session_id = ls.id and e.kind = 'event' and e.event_type = 'goal' and e.team_side = 'away') as away_goals
  from public.live_match_sessions ls
  where ls.ended_at is not null and ls.preparation_key like 'manual-%'
  order by ls.preparation_key, ls.ended_at desc
)
update public.manual_preparations mp
set goals_for = case when mp.is_home then s.home_goals else s.away_goals end,
    goals_against = case when mp.is_home then s.away_goals else s.home_goals end
from scores s
where s.preparation_key = 'manual-' || mp.id::text
  and mp.goals_for is null
  and mp.goals_against is null;
