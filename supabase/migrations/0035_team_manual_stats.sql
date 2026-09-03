-- Hand-entered mirror of the club's season headline stats (same fields as
-- the API-Football-sourced team statistics), same idea as
-- player_manual_stats: kept as its own record instead of overwriting the
-- external data, so the coach can track it by hand and compare the two.
-- One row per team (current season totals), upserted on every edit.
--
-- Carries stint_id for the same reason player_availability does (see
-- 0028) — it's another upserted-in-place row, this time per team.
create table public.team_manual_stats (
  team_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  played integer,
  wins integer,
  draws integer,
  loses integer,
  goals_for integer,
  goals_against integer,
  clean_sheets integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (team_id, stint_id)
);

alter table public.team_manual_stats enable row level security;

create policy "team_manual_stats: authenticated read"
  on public.team_manual_stats for select
  using (auth.role() = 'authenticated');

create policy "team_manual_stats: coach inserts"
  on public.team_manual_stats for insert
  with check (public.is_coach());

create policy "team_manual_stats: coach updates"
  on public.team_manual_stats for update
  using (public.is_coach());
