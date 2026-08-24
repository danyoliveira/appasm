-- Match clock milestones for Modo Jogo: kickoff (started_at, already exists),
-- half-time, second-half restart, full-time (ended_at, already exists).
alter table public.live_match_sessions
  add column halftime_at timestamptz,
  add column second_half_at timestamptz;
