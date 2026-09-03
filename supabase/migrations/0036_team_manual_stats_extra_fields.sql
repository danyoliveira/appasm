-- Extends team_manual_stats (0035) with the same external/internal
-- comparison for the richer season stats — home/away splits, biggest
-- results, and penalties — not just the four headline numbers.
alter table public.team_manual_stats
  add column if not exists played_home integer,
  add column if not exists played_away integer,
  add column if not exists wins_home integer,
  add column if not exists wins_away integer,
  add column if not exists draws_home integer,
  add column if not exists draws_away integer,
  add column if not exists loses_home integer,
  add column if not exists loses_away integer,
  add column if not exists goals_for_home integer,
  add column if not exists goals_for_away integer,
  add column if not exists goals_against_home integer,
  add column if not exists goals_against_away integer,
  add column if not exists clean_sheets_home integer,
  add column if not exists clean_sheets_away integer,
  add column if not exists biggest_win_goals_for integer,
  add column if not exists biggest_win_goals_against integer,
  add column if not exists biggest_loss_goals_for integer,
  add column if not exists biggest_loss_goals_against integer,
  add column if not exists penalty_scored integer,
  add column if not exists penalty_missed integer;
