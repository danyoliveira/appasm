alter table public.player_availability
  add column excluded boolean not null default false;
