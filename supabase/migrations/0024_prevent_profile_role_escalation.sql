-- "profiles: update own row" (0001) lets a user update their own profile
-- row, but never restricted WHICH columns — only WHICH row. Since role and
-- status live on that same row, any authenticated member/viewer could call
-- the Supabase client directly (bypassing the app entirely) and run
-- `update profiles set role = 'coach' where id = auth.uid()` (or role =
-- 'asm', or status = 'active' to undo a revoke) and grant themselves
-- coach/asm-level access. Every other write in this schema is already
-- gated at the RLS layer (is_coach()/is_coach_or_asm()) — this was the one
-- self-service escape hatch.
--
-- Fixed with a trigger rather than a WITH CHECK clause: WITH CHECK only
-- sees the new row, not the old one, so it can't express "role/status must
-- be unchanged unless the caller is a coach" on its own. The trigger runs
-- before every update (including the coach's own "update all" policy), so
-- a real coach changing someone else's role/status via updateMemberRole/
-- setMemberStatus is untouched — only a non-coach trying to change their
-- own role/status gets silently overwritten back to the prior value.
--
-- Uses is_coach() (not is_coach_or_asm()) to mirror the existing "profiles:
-- coach updates all" policy from 0004 exactly — today only role='coach'
-- can touch another profile's role/status at the RLS layer at all, so that
-- (not the live-stats-only is_coach_or_asm()) is the authority this
-- guards. If 'asm' ever needs the same reach here, extend both together.

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if not public.is_coach() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_role_escalation();
