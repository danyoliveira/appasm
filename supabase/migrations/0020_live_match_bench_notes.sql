-- Free-text briefing for the bench, entered as the last step of the guest
-- Member wizard (name → match sheet → formation → notes).
alter table public.live_match_sessions add column bench_notes text;
