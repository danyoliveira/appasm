-- Freezes each side's lineup at kickoff on the session itself, so a later
-- substitution edit doesn't rewrite history for stats already tied to "who
-- started". Found via `supabase db diff --linked` against production,
-- which already had these two columns — added there directly at some
-- point without a matching migration file; this brings the migration
-- history back in sync with the real schema.
alter table public.live_match_sessions
  add column home_lineup_snapshot jsonb;

alter table public.live_match_sessions
  add column away_lineup_snapshot jsonb;
