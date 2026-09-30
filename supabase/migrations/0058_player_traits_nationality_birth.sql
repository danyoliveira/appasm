-- The external source has no nationality, birth date or real photo for some
-- players (mostly youngsters and lower-profile leagues), which left them
-- without a flag, an age and a face. The coach can now fill these in; like
-- the preferred foot they belong to the player, not to a club or a spell,
-- so they sit in player_traits. When set, they take the place of whatever
-- the source says. The photo itself is uploaded to the public "avatars"
-- bucket (under the coach's own folder); only its URL is kept here.
alter table public.player_traits
  add column if not exists nationality text,
  add column if not exists birth_date date,
  add column if not exists photo_url text;
