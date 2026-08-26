-- Tracks each period the coach spent at a club. Switching clubs (see
-- updateClub in actions.ts) closes the current stint (sets ended_at) and
-- opens a new one — the foundation for the "Arquivo" feature, so a past
-- club's squad snapshot and preparations can be told apart from the
-- current club's.
--
-- Preparations (fixture_preparations, manual_preparations,
-- preparation_videos, preparation_tactics) don't need a stint_id of their
-- own: each row is for one real match that only ever happens once, so its
-- team_id + created_at already place it in exactly one stint — the archive
-- view filters by team_id and the stint's date range instead of adding a
-- column to four tables.
create table public.coaching_stints (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.coaching_stints enable row level security;

create policy "coaching_stints: authenticated read"
  on public.coaching_stints for select
  using (auth.role() = 'authenticated');

create policy "coaching_stints: coach inserts"
  on public.coaching_stints for insert
  with check (public.is_coach());

create policy "coaching_stints: coach updates"
  on public.coaching_stints for update
  using (public.is_coach());

-- player_availability is different from the preparation tables above: it's
-- one upserted row per (team, player), reused in place rather than
-- appended — so without a stint_id of its own, a coach returning to a
-- former club would inherit that club's years-old injury/exclusion
-- statuses instead of starting clean, and there'd be no way to look back
-- at what the squad looked like when the coach left.
alter table public.player_availability add column stint_id uuid references public.coaching_stints (id);
alter table public.player_availability drop constraint player_availability_team_id_player_id_key;
alter table public.player_availability add constraint player_availability_team_id_player_id_stint_id_key
  unique (team_id, player_id, stint_id);

-- Bootstrap: the coach's current club becomes an open-ended stint. Real
-- history before this feature existed isn't tracked, so the start date is
-- a fixed, manually-chosen date rather than a guess.
insert into public.coaching_stints (team_id, started_at)
select api_football_team_id, timestamptz '2026-08-01T00:00:00Z'
from public.profiles
where role = 'coach' and api_football_team_id is not null;

update public.player_availability pa
set stint_id = cs.id
from public.coaching_stints cs
where pa.team_id = cs.team_id and pa.stint_id is null;
