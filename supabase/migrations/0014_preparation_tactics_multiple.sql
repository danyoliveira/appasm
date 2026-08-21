-- preparation_tactics started as "one board per preparation, overwritten on
-- every save". It's actually meant to work like preparation_videos: each
-- save is a new, separately-kept snapshot (e.g. "their shape in open play"
-- vs "their shape at set pieces"), so the one-row-per-key constraint has to
-- go, and the timestamp/author columns are renamed to reflect "created"
-- rather than "last updated".
alter table public.preparation_tactics
  drop constraint if exists preparation_tactics_preparation_key_key;

alter table public.preparation_tactics rename column updated_at to created_at;
alter table public.preparation_tactics rename column updated_by to created_by;

drop policy if exists "preparation_tactics: coach updates" on public.preparation_tactics;

create policy "preparation_tactics: coach deletes"
  on public.preparation_tactics for delete
  using (public.is_coach());
