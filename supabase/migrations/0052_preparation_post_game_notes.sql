-- The coach's own post-match analysis (what went well, what to fix), written
-- in the Pós-Jogo tab next to the Live Mode summary and printed in the
-- post-game PDF. One text per preparation, on both kinds of preparation.
alter table public.fixture_preparations
  add column post_game_notes text;

alter table public.manual_preparations
  add column post_game_notes text;
