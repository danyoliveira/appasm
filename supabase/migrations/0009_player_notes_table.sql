-- Superseded the single `player_availability.note` column from 0008 with a
-- proper multi-entry notes list (add/edit/delete, each with its own
-- timestamp) — that column is left in place unused rather than dropped, to
-- avoid rewriting an already-shipped migration.
create table public.player_notes (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  player_id integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_notes enable row level security;

create policy "player_notes: coach reads"
  on public.player_notes for select
  using (public.is_coach());

create policy "player_notes: coach inserts"
  on public.player_notes for insert
  with check (public.is_coach());

create policy "player_notes: coach updates"
  on public.player_notes for update
  using (public.is_coach());

create policy "player_notes: coach deletes"
  on public.player_notes for delete
  using (public.is_coach());
