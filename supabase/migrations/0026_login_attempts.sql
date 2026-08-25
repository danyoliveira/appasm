-- Backs app-level login rate limiting (lib: login/actions.ts). Supabase
-- Auth has its own generic rate limits, but nothing scoped to "this one
-- email is being brute-forced" — this table is that.
--
-- Touched exclusively via the service-role client from the login Server
-- Action, which runs before the caller has any Supabase Auth session — RLS
-- has nothing to govern here (no anon/authenticated policy is needed or
-- wanted; only the app's own service-role access should ever read/write
-- this table).
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

create index login_attempts_email_created_at_idx
  on public.login_attempts (email, created_at);

alter table public.login_attempts enable row level security;
