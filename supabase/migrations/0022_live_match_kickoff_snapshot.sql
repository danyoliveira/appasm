-- Separates the pre-game configuration (home_lineup/away_lineup — owned by
-- the wizard tabs, editable only until kickoff, frozen forever after) from
-- the live in-match working copy Modo Jogo actually drags/subs/dismisses
-- players in. Without this split, in-match changes (a red card taking a
-- player off, a drag, a substitution) were overwriting the original Ficha
-- de Jogo/Formação Tática record.
alter table public.live_match_sessions
  add column if not exists home_lineup_live jsonb,
  add column if not exists away_lineup_live jsonb;
