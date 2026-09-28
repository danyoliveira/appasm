-- Link ASM Live Mode data to the real squad player. Lineups (jsonb) now
-- carry a `playerId` per player for our own team; every entry recorded for
-- one of our players (goal, assist, card, substitution, Modo GK selection
-- and actions) stores that id here too, next to the name. Null = not linked
-- (the opponent's players, free-text names, or data from before this).
alter table public.live_match_entries
  add column player_id integer;

create index live_match_entries_player_idx on public.live_match_entries (player_id)
  where player_id is not null;
