-- A third guest link for Modo Jogo: "GK Coach" can only touch the GK stats
-- endpoints (setGkByToken/addGkStatByToken/undoGkStatByToken) — everything
-- else (lineup, formation, events, collective stats, clock) still requires
-- the Member link. Added as a separate nullable-then-backfilled column
-- (not a table rewrite risk) to match how member_token/viewer_token exist.
alter table public.live_match_sessions add column gk_token text;

update public.live_match_sessions
  set gk_token = encode(gen_random_bytes(16), 'hex')
  where gk_token is null;

alter table public.live_match_sessions
  alter column gk_token set not null,
  alter column gk_token set default encode(gen_random_bytes(16), 'hex'),
  add constraint live_match_sessions_gk_token_key unique (gk_token);

-- Presence tracking needs to accept the new role too.
alter table public.live_match_presence drop constraint live_match_presence_role_check;
alter table public.live_match_presence add constraint live_match_presence_role_check
  check (role in ('member', 'viewer', 'gk_coach'));
