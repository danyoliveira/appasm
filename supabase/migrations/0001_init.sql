-- profiles: one row per auth user
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('coach', 'member')),
  api_football_team_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: read coach row"
  on public.profiles for select
  using (role = 'coach');

create policy "profiles: update own row"
  on public.profiles for update
  using (auth.uid() = id);

-- invites: coach-issued, invite-only registration
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users (id),
  accepted_by uuid references auth.users (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

alter table public.invites enable row level security;

create policy "invites: coach creates"
  on public.invites for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'coach')
  );

create policy "invites: coach reads own"
  on public.invites for select
  using (invited_by = auth.uid());

-- Deliberately NO policy allows anon/unauthenticated SELECT of invites.
-- Token validation for an unauthenticated visitor happens exclusively
-- through the service-role client in a Server Action (lib/invites.ts).

-- auto-create profile + auto-accept invite, atomically, on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  matched_invite public.invites%rowtype;
  is_bootstrap boolean;
begin
  select not exists (select 1 from public.profiles) into is_bootstrap;

  if not is_bootstrap then
    select * into matched_invite
      from public.invites
      where lower(email) = lower(new.email)
        and status = 'pending'
        and expires_at > now()
      order by created_at desc
      limit 1;
  end if;

  if is_bootstrap then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'coach');
  elsif matched_invite.id is not null then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'member');

    update public.invites
      set status = 'accepted', accepted_by = new.id, accepted_at = now()
      where id = matched_invite.id;
  end if;
  -- else: no bootstrap slot, no matching invite -> auth.users row is created
  -- but NO profile row exists. The app treats "no profile" as "no access".

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- API-Football response cache (service-role writes only; authenticated reads)
create table public.api_football_cache (
  cache_key text primary key,
  team_id integer not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.api_football_cache enable row level security;

create policy "api_football_cache: authenticated read"
  on public.api_football_cache for select
  using (auth.role() = 'authenticated');
