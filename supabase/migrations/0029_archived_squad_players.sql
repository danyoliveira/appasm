-- A frozen copy of the squad at the moment the coach leaves a club — the
-- live API-Football squad reflects real-world transfers going forward, so
-- it can't be used to show "what the squad looked like back then". Written
-- once, by updateClub, right before a stint's ended_at is set.
create table public.archived_squad_players (
  id uuid primary key default gen_random_uuid(),
  stint_id uuid not null references public.coaching_stints (id) on delete cascade,
  player_id integer not null,
  name text not null,
  photo text,
  number integer,
  position text,
  unique (stint_id, player_id)
);

alter table public.archived_squad_players enable row level security;

create policy "archived_squad_players: authenticated read"
  on public.archived_squad_players for select
  using (auth.role() = 'authenticated');

create policy "archived_squad_players: coach inserts"
  on public.archived_squad_players for insert
  with check (public.is_coach());
