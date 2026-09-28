-- Games created from scratch (manual preparations) now show up in the club
-- calendar, so they need what a calendar row shows for API fixtures:
--  * competition — one of the club's API competitions (league id + name +
--    logo copied at save time), or a free name ("Amigável", a tournament
--    outside API-Football); all null = no competition set.
--  * is_home — until now manual games were always treated as home.
--  * goals_for / goals_against — optional final score, entered by hand.
alter table public.manual_preparations
  add column competition_league_id integer,
  add column competition_name text,
  add column competition_logo text,
  add column is_home boolean not null default true,
  add column goals_for integer check (goals_for is null or goals_for >= 0),
  add column goals_against integer check (goals_against is null or goals_against >= 0);
