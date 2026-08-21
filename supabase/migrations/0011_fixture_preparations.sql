-- Marks that a coach opened the preparation flow for a real API-Football
-- fixture (as opposed to lib/api-football data itself, which knows nothing
-- about our own workflow). Created the first time the preparation detail
-- page for that fixture is loaded — used to filter the "past" side of the
-- preparation picker down to matches actually prepared, instead of every
-- match the team has ever played.
create table public.fixture_preparations (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  fixture_id integer not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (team_id, fixture_id)
);

alter table public.fixture_preparations enable row level security;

create policy "fixture_preparations: authenticated read"
  on public.fixture_preparations for select
  using (auth.role() = 'authenticated');

create policy "fixture_preparations: coach inserts"
  on public.fixture_preparations for insert
  with check (public.is_coach());
