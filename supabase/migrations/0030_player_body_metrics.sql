-- Editable height per player. Weight isn't here — unlike height it moves
-- throughout the season, so it gets its own history table (0031) instead of
-- a single overwritable value.
--
-- Carries stint_id for the same reason player_availability does (see
-- 0028): it's one upserted row per (team, player), reused in place, so
-- without a stint of its own a coach returning to a former club would
-- inherit that club's old height record instead of starting clean.
create table public.player_body_metrics (
  team_id integer not null,
  player_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  height_cm integer,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (team_id, player_id, stint_id)
);

alter table public.player_body_metrics enable row level security;

create policy "player_body_metrics: authenticated read"
  on public.player_body_metrics for select
  using (auth.role() = 'authenticated');

create policy "player_body_metrics: coach inserts"
  on public.player_body_metrics for insert
  with check (public.is_coach());

create policy "player_body_metrics: coach updates"
  on public.player_body_metrics for update
  using (public.is_coach());
