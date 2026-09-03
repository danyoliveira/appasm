-- Hand-entered mirror of the "Estatísticas da época" card (same fields as
-- the API-Football-sourced season stats), kept as its own record instead of
-- overwriting the external data — the coach can track things by hand
-- alongside the external feed and compare the two over time. One row per
-- player (current season totals), upserted on every edit rather than a log.
--
-- Carries stint_id for the same reason player_availability does (see
-- 0028) — it's another upserted-in-place row per (team, player).
create table public.player_manual_stats (
  team_id integer not null,
  player_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  appearances integer,
  minutes integer,
  goals integer,
  assists integer,
  saves integer,
  conceded integer,
  lineups integer,
  rating numeric(3, 1),
  shots_total integer,
  shots_on integer,
  dribble_attempts integer,
  dribble_success integer,
  tackles integer,
  interceptions integer,
  duels_total integer,
  duels_won integer,
  passes_total integer,
  passes_key integer,
  fouls_drawn integer,
  fouls_committed integer,
  yellow_cards integer,
  red_cards integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (team_id, player_id, stint_id)
);

alter table public.player_manual_stats enable row level security;

create policy "player_manual_stats: authenticated read"
  on public.player_manual_stats for select
  using (auth.role() = 'authenticated');

create policy "player_manual_stats: coach inserts"
  on public.player_manual_stats for insert
  with check (public.is_coach());

create policy "player_manual_stats: coach updates"
  on public.player_manual_stats for update
  using (public.is_coach());
