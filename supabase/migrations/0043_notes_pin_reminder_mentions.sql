-- Notes upgrades:
--  * pinned_at   — pinned notes stay on top of their list (ordered by when
--                  they were pinned); null = not pinned.
--  * remind_at   — optional "remind me on" day; the dashboard surfaces the
--                  note from that day on until the reminder is cleared.
--  * mentioned_player_ids (club notes only) — squad players "@mentioned"
--                  in the note, so it also shows on their player page.
alter table public.player_notes
  add column pinned_at timestamptz,
  add column remind_at date;

alter table public.club_notes
  add column pinned_at timestamptz,
  add column remind_at date,
  add column mentioned_player_ids integer[] not null default '{}';

create index club_notes_mentions_idx on public.club_notes using gin (mentioned_player_ids);
