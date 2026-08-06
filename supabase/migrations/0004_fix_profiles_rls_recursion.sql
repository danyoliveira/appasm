-- 0003 added policies that check "is the caller a coach?" via a subquery on
-- public.profiles itself. That subquery re-triggers RLS on profiles
-- (including this same policy), which Postgres detects as infinite
-- recursion (error 42P17). Fix: do that check inside a SECURITY DEFINER
-- function, so the internal lookup bypasses RLS instead of re-entering it.

create or replace function public.is_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'coach'
  );
$$;

drop policy "profiles: coach reads all" on public.profiles;
drop policy "profiles: coach updates all" on public.profiles;

create policy "profiles: coach reads all"
  on public.profiles for select
  using (public.is_coach());

create policy "profiles: coach updates all"
  on public.profiles for update
  using (public.is_coach());
