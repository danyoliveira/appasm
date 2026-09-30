-- The external source only knows four position groups (Goalkeeper,
-- Defender, Midfielder, Attacker) and nothing about a player's foot — the
-- coach fills both in.
--
-- Positions (a main one and an optional second one) are a coaching choice
-- at this club, so they live with the spell like height does
-- (player_body_metrics is already one row per team + player + stint).
alter table public.player_body_metrics
  add column if not exists primary_position text,
  add column if not exists secondary_position text;

alter table public.player_body_metrics
  drop constraint if exists player_body_metrics_positions_check;

alter table public.player_body_metrics
  add constraint player_body_metrics_positions_check check (
    (primary_position is null or primary_position in (
      'goalkeeper', 'right_back', 'centre_back', 'left_back',
      'defensive_mid', 'central_mid', 'attacking_mid',
      'right_winger', 'left_winger', 'second_striker', 'striker'
    ))
    and (secondary_position is null or secondary_position in (
      'goalkeeper', 'right_back', 'centre_back', 'left_back',
      'defensive_mid', 'central_mid', 'attacking_mid',
      'right_winger', 'left_winger', 'second_striker', 'striker'
    ))
  );

-- The preferred foot is the player's, not the club's: one row per player,
-- no team and no stint, so it's still there after a change of club (and
-- for a player met again at another club).
create table if not exists public.player_traits (
  player_id integer primary key,
  preferred_foot text check (preferred_foot in ('left', 'right', 'both')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.player_traits enable row level security;

create policy "player_traits: authenticated read"
  on public.player_traits for select
  using (auth.role() = 'authenticated');

create policy "player_traits: coach inserts"
  on public.player_traits for insert
  with check (public.is_coach());

create policy "player_traits: coach updates"
  on public.player_traits for update
  using (public.is_coach());

create policy "player_traits: coach deletes"
  on public.player_traits for delete
  using (public.is_coach());
