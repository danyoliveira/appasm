alter table public.player_availability drop constraint player_availability_status_check;
alter table public.player_availability add constraint player_availability_status_check
  check (status in ('available', 'doubtful', 'injured', 'suspended', 'unavailable'));
