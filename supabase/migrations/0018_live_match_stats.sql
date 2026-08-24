-- ASM Live Stats: live in-game event/stat feed, shared with people who
-- never log into the platform (bench staff on their own phone). Two access
-- paths onto the same data:
--   1. Authenticated dashboard ("No Jogo" tab) — governed by RLS below.
--   2. Guest links (member/viewer tokens on live_match_sessions) — guests
--      never touch Supabase Auth/RLS at all; Server Actions validate the
--      token and read/write through the admin (service-role) client.

create extension if not exists pgcrypto;

-- 'asm' is the platform owner's override role — same powers as 'coach'
-- everywhere, kept as a separate value so it's clearly not "this club's
-- own coach" (e.g. when listing members).
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('coach', 'member', 'viewer', 'asm'));

create or replace function public.is_coach_or_asm()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('coach', 'asm')
  );
$$;

-- Who can write to ASM Live Stats from inside the authenticated dashboard.
-- 'member' gets real write permissions here for the first time — every
-- other table so far only ever allowed 'coach'. 'viewer' stays read-only.
create or replace function public.is_live_stats_editor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('coach', 'asm', 'member')
  );
$$;

-- One row per match being tracked live. member_token/viewer_token are the
-- secrets behind the shareable guest links (.../live/<token>) — whoever
-- holds the link gets that permission level, no account needed.
create table public.live_match_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  preparation_key text not null,
  member_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  viewer_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table public.live_match_sessions enable row level security;

create policy "live_match_sessions: authenticated read"
  on public.live_match_sessions for select
  using (auth.role() = 'authenticated');

create policy "live_match_sessions: coach/asm insert"
  on public.live_match_sessions for insert
  with check (public.is_coach_or_asm());

create policy "live_match_sessions: coach/asm update"
  on public.live_match_sessions for update
  using (public.is_coach_or_asm());

-- The feed itself. `kind` splits structured match events (goal/card/sub —
-- shipping first) from free-form club-defined stats (stat_key/stat_value —
-- next increment), sharing one chronological timeline instead of two lists.
create table public.live_match_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_match_sessions (id) on delete cascade,
  kind text not null check (kind in ('event', 'stat')),
  minute integer,
  extra_minute integer,
  team_side text check (team_side in ('home', 'away')),
  player_name text,
  event_type text,
  stat_key text,
  stat_value text,
  notes text,
  created_at timestamptz not null default now(),
  -- Authenticated entries carry created_by; guest entries (no auth session)
  -- carry whatever label the guest typed in once ("Bancada — Ricardo").
  created_by uuid references auth.users (id),
  created_by_label text
);

alter table public.live_match_entries enable row level security;

create policy "live_match_entries: authenticated read"
  on public.live_match_entries for select
  using (auth.role() = 'authenticated');

create policy "live_match_entries: editors insert"
  on public.live_match_entries for insert
  with check (public.is_live_stats_editor());

create policy "live_match_entries: editors update"
  on public.live_match_entries for update
  using (public.is_live_stats_editor());

create policy "live_match_entries: editors delete"
  on public.live_match_entries for delete
  using (public.is_live_stats_editor());
