-- Club-level notes (not about a specific player) — same shape and access
-- rules as player_notes, restricted to the coach.
create table public.club_notes (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_notes enable row level security;

create policy "club_notes: coach reads"
  on public.club_notes for select
  using (public.is_coach());

create policy "club_notes: coach inserts"
  on public.club_notes for insert
  with check (public.is_coach());

create policy "club_notes: coach updates"
  on public.club_notes for update
  using (public.is_coach());

create policy "club_notes: coach deletes"
  on public.club_notes for delete
  using (public.is_coach());
