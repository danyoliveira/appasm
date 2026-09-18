-- Lets a preparation video be tagged with which sub-phase of its broader
-- moment it documents (e.g. defense -> high press), matching the club's own
-- phase-of-play breakdown. Nullable and only meaningful alongside a
-- category — the app enforces which submoments pair with which category,
-- this just constrains the value set.
alter table public.preparation_videos
  add column submoment text check (submoment in (
    'goal_kick_defense', 'high_press', 'defensive_block',
    'build_up_first_phase', 'build_up_second_phase', 'finishing_zone',
    'transition_offensive', 'transition_defensive',
    'corner_for', 'corner_against', 'penalty'
  ));
