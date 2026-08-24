-- Lets a saved preparation video be edited in place (url/notes/category/
-- player/tactical snapshot) instead of delete-and-recreate, matching
-- preparation_tactics.
create policy "preparation_videos: coach updates"
  on public.preparation_videos for update
  using (public.is_coach());
