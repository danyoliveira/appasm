-- Lets a manual preparation's opponent be a club that isn't in
-- API-Football's own database at all (a local/amateur side, a youth team,
-- etc.) — not just one outside our fixture list. opponent_team_id stays the
-- normal path (name/logo still resolved live via the team-info cache);
-- opponent_name/opponent_logo cover the case where there's no API-Football
-- team to look up.
alter table public.manual_preparations
  alter column opponent_team_id drop not null,
  add column opponent_name text,
  add column opponent_logo text;

alter table public.manual_preparations
  add constraint manual_preparations_opponent_check
  check (opponent_team_id is not null or opponent_name is not null);
