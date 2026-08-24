-- Lets a preparation video be tagged with what it documents: a broad theme,
-- a specific opponent player (cross-linked onto that player's page), and/or
-- the tactical-board snapshot it illustrates. All optional/independent —
-- a video can have any combination of the three, or none.
alter table public.preparation_videos
  add column category text check (category in ('attack', 'defense', 'set_pieces', 'transitions')),
  add column player_id integer,
  add column tactical_snapshot_id uuid references public.preparation_tactics (id) on delete set null;
