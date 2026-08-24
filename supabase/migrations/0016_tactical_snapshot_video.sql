-- A simple video link directly on a tactical analysis snapshot — separate
-- from the categorized preparation_videos entity, since a snapshot's video
-- is exactly one clip illustrating that analysis (no category/player
-- picker needed). Also brings back an update policy so a snapshot's notes
-- and video link can be edited in place instead of delete-and-recreate.
alter table public.preparation_tactics add column video_url text;

create policy "preparation_tactics: coach updates"
  on public.preparation_tactics for update
  using (public.is_coach());
