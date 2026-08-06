-- Manual player availability, set by the coach. Distinct from the
-- API-Football injuries feed (official injuries only) — this also covers
-- suspensions, personal reasons, etc. `last_seen_injury_key` remembers
-- which API-reported injury the coach already reacted to (confirmed or
-- dismissed as not real), so the same report doesn't keep re-prompting.
create table public.player_availability (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  player_id integer not null,
  player_name text not null,
  status text not null default 'available'
    check (status in ('available', 'doubtful', 'injured', 'suspended')),
  last_seen_injury_key text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (team_id, player_id)
);

alter table public.player_availability enable row level security;

create policy "player_availability: authenticated read"
  on public.player_availability for select
  using (auth.role() = 'authenticated');

create policy "player_availability: coach writes"
  on public.player_availability for insert
  with check (public.is_coach());

create policy "player_availability: coach updates"
  on public.player_availability for update
  using (public.is_coach());
