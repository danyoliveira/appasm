-- Weight history — every entry is kept (not overwritten), so progress over
-- the season can be tracked instead of only seeing the latest value.
create table public.player_weight_log (
  id uuid primary key default gen_random_uuid(),
  team_id integer not null,
  player_id integer not null,
  weight_kg numeric(5, 1) not null,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table public.player_weight_log enable row level security;

create policy "player_weight_log: authenticated read"
  on public.player_weight_log for select
  using (auth.role() = 'authenticated');

create policy "player_weight_log: coach inserts"
  on public.player_weight_log for insert
  with check (public.is_coach());

create policy "player_weight_log: coach updates"
  on public.player_weight_log for update
  using (public.is_coach());

create policy "player_weight_log: coach deletes"
  on public.player_weight_log for delete
  using (public.is_coach());
