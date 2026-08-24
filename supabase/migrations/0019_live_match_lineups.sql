-- Starting XI + substitutes + formation for each side, entered (and freely
-- re-edited — team news changes right up to kickoff) by whoever holds the
-- Member link. One pair of columns per side on the session row rather than
-- a separate table: there's exactly one lineup per team per match, always
-- read/written as a whole, never queried independently of the session.
alter table public.live_match_sessions
  add column home_formation text,
  add column away_formation text,
  add column home_lineup jsonb not null default '[]'::jsonb,
  add column away_lineup jsonb not null default '[]'::jsonb;
