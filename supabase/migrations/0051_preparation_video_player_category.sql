-- Video analysis gained a "Jogador" (player) category, but the original
-- check constraint (0015) only allowed the four phases of play — saving a
-- video tagged "player" failed with preparation_videos_category_check.
alter table public.preparation_videos
  drop constraint if exists preparation_videos_category_check;

alter table public.preparation_videos
  add constraint preparation_videos_category_check
  check (category in ('attack', 'defense', 'set_pieces', 'transitions', 'player'));
