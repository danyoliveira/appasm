-- The drag-and-drop tactical board for "Análise do Adversário" — one row
-- per preparation (same preparation_key convention as manual_preparations /
-- preparation_videos). `positions` is a JSON array of placed players
-- ({playerId, name, number, photo, x, y} with x/y as 0-100 percentages of
-- the pitch), stored as a single blob rather than one row per player since
-- the whole board is always read and saved together.
create table public.preparation_tactics (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  preparation_key text not null unique,
  positions jsonb not null default '[]'::jsonb,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.preparation_tactics enable row level security;

create policy "preparation_tactics: authenticated read"
  on public.preparation_tactics for select
  using (auth.role() = 'authenticated');

create policy "preparation_tactics: coach inserts"
  on public.preparation_tactics for insert
  with check (public.is_coach());

create policy "preparation_tactics: coach updates"
  on public.preparation_tactics for update
  using (public.is_coach());
