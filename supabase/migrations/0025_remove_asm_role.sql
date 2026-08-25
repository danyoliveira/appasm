-- The 'asm' role (0018) was meant as a platform-owner override — "same
-- powers as coach everywhere" per its own comment — but was only ever
-- wired up for live_match_sessions/live_match_entries. Everywhere else
-- (profiles management, invites, preparations, videos, player notes,
-- availability) it had no more access than 'member'/'viewer'. Rather than
-- finish wiring it up, it's being removed outright — this deployment has
-- exactly one coach and doesn't need a separate owner tier.

-- Any profile that was actually set to 'asm' becomes 'coach' instead — the
-- closest equivalent, and harmless: is_coach() doesn't care how many rows
-- have role = 'coach'.
update public.profiles set role = 'coach' where role = 'asm';

-- Policies referencing is_coach_or_asm() have to be rebuilt against
-- is_coach() before that function can be dropped.
drop policy "live_match_sessions: coach/asm insert" on public.live_match_sessions;
drop policy "live_match_sessions: coach/asm update" on public.live_match_sessions;

create policy "live_match_sessions: coach inserts"
  on public.live_match_sessions for insert
  with check (public.is_coach());

create policy "live_match_sessions: coach updates"
  on public.live_match_sessions for update
  using (public.is_coach());

drop function public.is_coach_or_asm();

-- live_match_entries' editor check also listed 'asm' — drop it; coach and
-- member keep write access, matching every other table's actual behavior.
create or replace function public.is_live_stats_editor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role in ('coach', 'member')
  );
$$;

-- Finally, 'asm' is no longer an allowed value at all.
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('coach', 'member', 'viewer'));
