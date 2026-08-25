-- Lightweight "who's connected right now" for ASM Live Mode — lets the
-- coach see, at a glance, whether the Member/Viewer links are actually
-- reaching anyone (and notice a drop to 0 right after regenerating a link,
-- confirming the old link really did stop working instead of just hoping).
--
-- Piggybacks on the guest view's existing 4s poll instead of a websocket/
-- Realtime channel: every getLiveFeedByToken call upserts a heartbeat row
-- keyed by a per-tab connection id, and "online" is just "seen in the last
-- ~12 seconds" — simpler and more robust than a persistent connection over
-- a stadium wifi/cellular link.
create table public.live_match_presence (
  session_id uuid not null references public.live_match_sessions (id) on delete cascade,
  connection_id text not null,
  role text not null check (role in ('member', 'viewer')),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, connection_id)
);

create index live_match_presence_session_id_idx on public.live_match_presence (session_id);

alter table public.live_match_presence enable row level security;
-- No policies — same reasoning as login_attempts: guests hitting this via
-- their token never have a Supabase Auth session, and the coach's read
-- also goes through the service-role client (see getLiveSessionPresence),
-- so RLS has nothing to govern here.
