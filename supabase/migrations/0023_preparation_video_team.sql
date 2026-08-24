-- Videos are now filed under a team tab too, same as tactical snapshots —
-- lets the video list be split into "Nossa Equipa" / "Adversário" like the
-- tactical board already is. Existing rows default to 'opponent' (the only
-- team videos could ever be tagged to before this column existed).
alter table public.preparation_videos
  add column team text not null default 'opponent' check (team in ('us', 'opponent'));
