-- Country/league-level cache entries (country list, teams-by-country) aren't
-- tied to a single team, so team_id needs to be optional.
alter table public.api_football_cache
  alter column team_id drop not null;
