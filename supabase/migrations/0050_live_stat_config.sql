-- ASM Live Mode fields configurable by the coach (collective counters and
-- the goalkeeper's actions, in groups). One config per club; each game
-- freezes the config it kicked off with, so changes only reach later games.
create table public.live_stat_configs (
  team_id integer primary key,
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.live_stat_configs enable row level security;

create policy "live_stat_configs: authenticated read"
  on public.live_stat_configs for select
  using (auth.role() = 'authenticated');

create policy "live_stat_configs: coach inserts"
  on public.live_stat_configs for insert
  with check (public.is_coach());

create policy "live_stat_configs: coach updates"
  on public.live_stat_configs for update
  using (public.is_coach())
  with check (public.is_coach());

-- The config a game kicked off with (null = not started yet, or a game from
-- before configs existed — shown with the built-in default).
alter table public.live_match_sessions
  add column stat_config jsonb;
