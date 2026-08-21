-- Preparations for a match not in API-Football's fixture list for our team
-- (e.g. a friendly not yet published, or an opponent picked ahead of
-- official scheduling). Only the opponent's API-Football team id and the
-- match date are stored — everything else about the opponent (name, logo)
-- is fetched live via the existing team-info cache, not duplicated here.
create table public.manual_preparations (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  opponent_team_id integer not null,
  match_date timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table public.manual_preparations enable row level security;

create policy "manual_preparations: authenticated read"
  on public.manual_preparations for select
  using (auth.role() = 'authenticated');

create policy "manual_preparations: coach inserts"
  on public.manual_preparations for insert
  with check (public.is_coach());

create policy "manual_preparations: coach deletes"
  on public.manual_preparations for delete
  using (public.is_coach());
