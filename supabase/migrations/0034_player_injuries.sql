-- Internal injury log — the source of truth for a player's injury history,
-- instead of the external API's sidelined/injuries data (often incomplete
-- or delayed, and disconnected from the coach's own "injured" status). One
-- row per injury episode: opened when the coach marks a player injured
-- (manually, or by confirming one the API flagged), closed when the coach
-- confirms the player's actual return.
create table public.player_injuries (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  player_id integer not null,
  stint_id uuid references public.coaching_stints (id),
  description text not null,
  -- "api" means this episode started from confirming a sidelined reason the
  -- API reported (api_injury_key carries that reason, so a later poll that
  -- still reports it doesn't prompt again — same idea as
  -- player_availability.last_seen_injury_key).
  source text not null default 'manual' check (source in ('manual', 'api')),
  api_injury_key text,
  started_at date not null default current_date,
  expected_return_at date,
  actual_return_at date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.player_injuries enable row level security;

create policy "player_injuries: authenticated read"
  on public.player_injuries for select
  using (auth.role() = 'authenticated');

create policy "player_injuries: coach inserts"
  on public.player_injuries for insert
  with check (public.is_coach());

create policy "player_injuries: coach updates"
  on public.player_injuries for update
  using (public.is_coach());

create policy "player_injuries: coach deletes"
  on public.player_injuries for delete
  using (public.is_coach());

-- Fast lookup for "which players have an open injury" (squad list + player
-- page return-confirmation prompts both filter on this).
create index player_injuries_open_idx
  on public.player_injuries (team_id, player_id)
  where actual_return_at is null;
